import crypto from 'node:crypto';
import {ApiError} from './auth';
const key=()=>{const raw=process.env.SOCIAL_TOKEN_KEY;if(!raw) throw new ApiError('SOCIAL_NOT_CONFIGURED',503);const bytes=Buffer.from(raw,'base64');if(bytes.length!==32) throw new ApiError('SOCIAL_TOKEN_KEY_INVALID',503);return bytes;};
export function encrypt(value:string){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
export function decrypt(value:string){const bytes=Buffer.from(value,'base64'),decipher=crypto.createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}
export function youtubeConfigured(){return !!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.SOCIAL_TOKEN_KEY);}
