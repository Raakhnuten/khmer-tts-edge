import { createReadStream } from 'fs';

export function streamFile(
  res: any,
  filePath: string,
  filename: string,
  contentType: string,
  dispositionType: string = 'inline',
): void {
  const stream = createReadStream(filePath);
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (!res.headersSent) {
      if (err.code === 'ENOENT') {
        res.status(404).json({
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'File not found' },
        });
      } else {
        res.status(500).json({
          success: false,
          error: { code: 'STREAM_ERROR', message: `Failed to read file: ${err.message}` },
        });
      }
    }
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  stream.pipe(res);
}
