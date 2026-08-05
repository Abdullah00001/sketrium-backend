/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import httpStatus from 'http-status';
// import mime from 'mime'; // Library to determine MIME types



import AppError from '../error/AppError';
import config from '../config';
import { s3Client } from './s3';


// Upload a single file to S3
export const uploadToS3 = async (file: any, fileName: string) => {
  try {
    const uniqueNumber = parseInt(
      (
        Date.now().toString() + Math.floor(Math.random() * 10000).toString()
      ).slice(-8),
      10,
    );
    const uniqueFileName = `${fileName}-${uniqueNumber}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: config.aws.bucket,
      Key: uniqueFileName,
      Body: file.buffer,
      ContentType: file.mimetype, // Ensure Content-Type is set
      // ACL: 'public-read', // Ensure the file is publicly readable
    });

    await s3Client.send(command);

    // Generate the publicly accessible URL for the file
    const url = `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${uniqueFileName}`;
    return { id: uniqueFileName, url };
  } catch (error) {
    throw new AppError(httpStatus.BAD_REQUEST, 'File Upload failed!');
  }
};

// Delete a single file from S3
export const deleteFromS3 = async (key: string) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: config.aws.bucket,
      Key: key,
    });
    await s3Client.send(command);
  } catch (error) {
    throw new AppError(httpStatus.BAD_REQUEST, 'S3 file delete failed');
  }
};

// Upload multiple files to S3
export const uploadManyToS3 = async (
  files: {
    file: any;
    path: string; // Path for the folder, e.g., 'service/'
    originalname?: string; // Optional custom filename
  }[],
): Promise<{ url: string; id: string }[]> => {
  try {
    const uniqueNumber = parseInt(
      (
        Date.now().toString() + Math.floor(Math.random() * 10000).toString()
      ).slice(-8),
      10,
    );

    // Map each file upload to a promise
    const uploadPromises = files.map(async ({ file, path, originalname }) => {
      const folderPath = path.endsWith('/') ? path : `${path}/`;
      const uniqueFileName = `${originalname || uniqueNumber}-${file.originalname}`;
      const fullKey = `${folderPath}${uniqueFileName}`;

      const command = new PutObjectCommand({
        Bucket: config.aws.bucket,
        Key: fullKey,
        Body: file.buffer,
        ContentType: file.mimetype, // Ensure Content-Type
        // ACL: 'public-read', // Ensure public access
      });

      await s3Client.send(command);

      // Generate URL for the uploaded file
      const url = `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${fullKey}`;
      return { url, id: fullKey };
    });

    // Wait for all uploads to complete
    const uploadedUrls = await Promise.all(uploadPromises);
    return uploadedUrls;
  } catch (error) {
    console.log(error);
    throw new AppError(httpStatus.BAD_REQUEST, 'File Upload failed');
  }
};

// Delete multiple files from S3
export const deleteManyFromS3 = async (keys: string[]) => {
  try {
    const deleteParams = {
      Bucket: config.aws.bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    };

    const command = new DeleteObjectsCommand(deleteParams);
    await s3Client.send(command);
  } catch (error) {
    throw new AppError(httpStatus.BAD_REQUEST, 'S3 file delete failed');
  }
};