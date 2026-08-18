import crypto from 'crypto'; export const makeToken=()=>crypto.randomBytes(32).toString('base64url'); export const hashToken=(v:string)=>crypto.createHash('sha256').update(v).digest('hex');
