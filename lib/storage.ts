import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
const bucket=process.env.MEDIA_BUCKET;
const client=()=>new S3Client({region:process.env.MEDIA_REGION||'auto',endpoint:process.env.MEDIA_ENDPOINT||undefined,
 credentials:process.env.MEDIA_ACCESS_KEY_ID&&process.env.MEDIA_SECRET_ACCESS_KEY?{accessKeyId:process.env.MEDIA_ACCESS_KEY_ID,secretAccessKey:process.env.MEDIA_SECRET_ACCESS_KEY}:undefined,
 forcePathStyle:!!process.env.MEDIA_ENDPOINT});
const local=(key:string)=>path.resolve(process.cwd(),'data/private',key);
export async function putMedia(key:string,bytes:Buffer,mime:string){if(bucket){await client().send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:mime,ServerSideEncryption:process.env.MEDIA_SSE==='AES256'?'AES256':undefined}));return;}
 await mkdir(path.dirname(local(key)),{recursive:true});await writeFile(local(key),bytes,{flag:'wx',mode:0o600});}
export async function getMedia(key:string,range?:string){if(bucket){const response=await client().send(new GetObjectCommand({Bucket:bucket,Key:key,Range:range}));return {bytes:Buffer.from(await response.Body!.transformToByteArray()),contentRange:response.ContentRange};}
 const bytes=await readFile(local(key));if(!range)return {bytes};const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)throw new Error('INVALID_RANGE');const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;if(start>=bytes.length||end<start)throw new Error('INVALID_RANGE');return {bytes:bytes.subarray(start,end+1),contentRange:`bytes ${start}-${end}/${bytes.length}`};}
export async function removeMedia(key:string){if(bucket){await client().send(new DeleteObjectCommand({Bucket:bucket,Key:key}));return;}await unlink(local(key)).catch(()=>{});}
