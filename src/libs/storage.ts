import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { uuidv7 } from 'uuidv7';

export class StorageService {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET_NAME || '';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucket) {
      console.warn('R2 storage configuration is missing. Uploads will fail.');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  /**
   * Upload a file to R2 storage
   * @param file The file to upload (File or Blob from Hono)
   * @param folder Optional folder path within the bucket
   * @returns The public URL of the uploaded file
   */
  async uploadFile(file: File | Blob, folder: string = 'products'): Promise<string> {
    const fileNameStr = (file as File).name || 'image.jpg';
    const fileExtension = fileNameStr.split('.').pop() || 'jpg';
    const fileName = `${folder}/${uuidv7()}.${fileExtension}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
    });

    await this.client.send(command);

    return `${this.publicUrl}/${fileName}`;
  }
}

export const storageService = new StorageService();
