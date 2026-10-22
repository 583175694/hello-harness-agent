import { describe, expect, it } from 'vitest';
import {
  guessUploadMimeType,
  inferUploadFileName,
  isSupportedUploadMime,
} from './guess-upload-mime';

describe('guessUploadMimeType', () => {
  it('maps octet-stream by extension', () => {
    expect(guessUploadMimeType('notes.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(guessUploadMimeType('readme.md', 'application/octet-stream')).toBe('text/markdown');
  });

  it('promotes plain text markdown by filename', () => {
    expect(guessUploadMimeType('readme.md', 'text/plain')).toBe('text/markdown');
  });

  it('strips charset from reported mime', () => {
    expect(guessUploadMimeType('doc.md', 'text/markdown; charset=utf-8')).toBe('text/markdown');
    expect(isSupportedUploadMime('text/markdown; charset=utf-8')).toBe(true);
  });

  it('normalizes markdown aliases from document picker', () => {
    expect(guessUploadMimeType('notes.txt', 'text/x-markdown')).toBe('text/markdown');
  });
});

describe('inferUploadFileName', () => {
  it('adds extension from cache uri when name lacks one', () => {
    expect(
      inferUploadFileName('My Note', 'file:///var/.../My%20Note.md'),
    ).toBe('My Note.md');
  });
});

describe('isSupportedUploadMime', () => {
  it('accepts pdf and jpeg', () => {
    expect(isSupportedUploadMime('application/pdf')).toBe(true);
    expect(isSupportedUploadMime('image/jpeg')).toBe(true);
  });
});
