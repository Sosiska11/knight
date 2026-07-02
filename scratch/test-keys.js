import crypto from 'crypto';

const privateKeyB64 = 'IMhTwwqDi35tvTLhLOK3aQp1_JMFexneCXsHuxKnkmw';
const expectedPublicKeyB64 = 'RWc0hf-pPEhU9h91ly1Dax4oFRSdOGzmtnqMZ6arfj8';

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64');
}

function base64urlEncode(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

try {
  const privBytes = base64urlDecode(privateKeyB64);
  const pkcs8Header = Buffer.from('302e020100300506032b656e04220420', 'hex');
  const pkcs8Key = Buffer.concat([pkcs8Header, privBytes]);
  
  const privKeyObject = crypto.createPrivateKey({
    key: pkcs8Key,
    format: 'der',
    type: 'pkcs8'
  });
  
  const pubKeyObject = crypto.createPublicKey(privKeyObject);
  const jwk = pubKeyObject.export({
    format: 'jwk'
  });
  
  const derivedPublicKeyB64 = jwk.x;
  
  console.log('--- KEY PAIR VERIFICATION ---');
  console.log('Private Key:       ', privateKeyB64);
  console.log('Expected Public Key:', expectedPublicKeyB64);
  console.log('Derived Public Key: ', derivedPublicKeyB64);
  console.log('Match:             ', expectedPublicKeyB64 === derivedPublicKeyB64 ? '🟢 YES' : '🔴 NO');
} catch (e) {
  console.error('Error verifying keys:', e);
}
