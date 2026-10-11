// Verify npm's registry integrity signatures; this is not Sigstore verification.
import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey, verify } from 'node:crypto';

const [metadataPath, keysPath, archivePath, attestationsPath] = process.argv.slice(2);
if (!metadataPath || !keysPath || !archivePath) throw new Error('Expected metadata, keys and tarball paths');
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const keys = JSON.parse(await readFile(keysPath, 'utf8'));
const archive = await readFile(archivePath);
const message = Buffer.from(`${metadata.name}@${metadata.version}:${metadata.dist.integrity}`);
const signatures = (metadata.dist.signatures ?? []).map(signature => {
  const key = keys.keys.find(candidate => candidate.keyid === signature.keyid);
  return { keyid: signature.keyid, known_registry_key: Boolean(key), key_expires: key?.expires ?? null,
    signature_valid: Boolean(key) && verify('sha256', message,
      createPublicKey({ key: Buffer.from(key.key, 'base64'), format: 'der', type: 'spki' }),
      Buffer.from(signature.sig, 'base64')) };
});
if (!signatures.length || signatures.some(signature => !signature.signature_valid)) {
  throw new Error('Registry signature is absent, unknown or invalid');
}
function envelopes(value) {
  if (!value || typeof value !== 'object') return [];
  if (typeof value.payload === 'string' && typeof value.payloadType === 'string') return [value];
  return Object.values(value).flatMap(envelopes);
}
const statements = attestationsPath
  ? envelopes(JSON.parse(await readFile(attestationsPath, 'utf8'))).map(envelope => JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8')))
  : [];
const provenance = statements.map(statement => ({ predicateType: statement.predicateType,
  subjects: statement.subject,
  subject_digest_matches_download: statement.subject?.some(subject => Object.entries(subject.digest ?? {}).some(([algorithm, digest]) =>
    ['sha256', 'sha512'].includes(algorithm) && createHash(algorithm).update(archive).digest('hex') === digest)) ?? false,
  buildDefinition: statement.predicate?.buildDefinition,
  runDetails: statement.predicate?.runDetails,
}));
if (attestationsPath && (!provenance.length || provenance.some(item => !item.subject_digest_matches_download))) {
  throw new Error('Advertised attestation subject differs from downloaded tarball');
}
process.stdout.write(JSON.stringify({ checked_at: new Date().toISOString(), name: metadata.name, version: metadata.version,
  registry_ecdsa_signatures: signatures, provenance_payloads: provenance,
  sigstore_certificate_and_transparency_log_verification: 'NOT_RUN' }) + '\n');
