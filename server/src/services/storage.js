import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { env } from '../config/env.js';

/**
 * One storage API, two drivers:
 *  - local: files live under STORAGE_ROOT and are served by Express (/media) – for development
 *  - s3:    files live in S3 and are served to learners through CloudFront (signed cookies)
 */
const isS3 = env.storage.driver === 's3';
const s3 = isS3 ? new S3Client({ region: env.aws.region }) : null;

const MIME = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
};
const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

function localPath(key) {
  const full = path.resolve(env.storage.root, key);
  if (!full.startsWith(env.storage.root + path.sep)) throw new Error('Invalid storage key');
  return full;
}

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export async function putFile(srcPath, key, { contentType, cacheControl } = {}) {
  if (isS3) {
    await new Upload({
      client: s3,
      params: {
        Bucket: env.aws.bucket,
        Key: key,
        Body: createReadStream(srcPath),
        ContentType: contentType || mimeFor(key),
        CacheControl: cacheControl,
      },
    }).done();
    return;
  }
  const dest = localPath(key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(srcPath, dest);
}

/** Upload a whole directory under `prefix/`. Used for HLS output (versioned, so safe to cache forever). */
export async function putDir(srcDir, prefix) {
  const files = await walk(srcDir);
  const immutable = 'public, max-age=31536000, immutable';
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(
      files.slice(i, i + 8).map((file) => {
        const rel = path.relative(srcDir, file).split(path.sep).join('/');
        return putFile(file, `${prefix}/${rel}`, { cacheControl: immutable });
      })
    );
  }
  return files.length;
}

export async function downloadToFile(key, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  if (isS3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.aws.bucket, Key: key }));
    await pipeline(res.Body, createWriteStream(destPath));
    return;
  }
  await fs.copyFile(localPath(key), destPath);
}

export async function deletePrefix(prefix) {
  if (!prefix) return;
  if (!isS3) {
    await fs.rm(localPath(prefix), { recursive: true, force: true });
    return;
  }
  let token;
  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: env.aws.bucket, Prefix: prefix, ContinuationToken: token })
    );
    const objects = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (objects.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: env.aws.bucket, Delete: { Objects: objects } }));
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}

export async function deleteKey(key) {
  if (!key) return;
  if (!isS3) return fs.rm(localPath(key), { force: true });
  await s3.send(new DeleteObjectsCommand({ Bucket: env.aws.bucket, Delete: { Objects: [{ Key: key }] } }));
}

/** Public (but access-controlled) URL for a storage key. */
export const urlFor = (key) => (isS3 ? `https://${env.cloudfront.domain}/${key}` : `/media/${key}`);
