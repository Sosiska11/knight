import crypto from 'crypto';
const mainUuid = '0803d6f0-d419-4368-a8b2-b9bdb287784f';
const hash = crypto.createHash('sha256').update(mainUuid).digest('hex');
const bypassUuid = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
console.log('Main UUID:', mainUuid);
console.log('Bypass UUID:', bypassUuid);
