import { Request } from 'express';
import multer, { memoryStorage } from 'multer';

const fileUpload = () => {
  const upload = multer({
    storage: memoryStorage(),
    limits: {
      fileSize: 20000000, // Limit file size to 20MB
    },
    fileFilter: function (req: Request, file, cb) {
      const allowedTypes = [
        // Image types
        'image/png',
        'image/jpg',
        'image/jpeg',
        'image/svg+xml',
        // Video types
        'video/mp4',
        'video/mpeg',
        'video/ogg',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
        // Audio types
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'audio/x-wav',
        'audio/webm',
      ];

      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true); // File is allowed
      } else {
        const error: any = new Error(
          'Only image, video, or audio files are allowed',
        );
        cb(error, false); // Reject the file
      }
    },
  });

  return upload;
};
const upload = fileUpload();
export default upload;