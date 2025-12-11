// scripts/modules/fileManager.js

class FileManager {
  constructor({ onAudioLoad, onSubtitleLoad, onWarning }) {
    this.onAudioLoad = onAudioLoad;
    this.onSubtitleLoad = onSubtitleLoad;
    this.onWarning = onWarning;
  }

  // Minimal ID3v2 APIC extraction to obtain embedded cover art
  async extractCoverArt(file) {
    try {
      const headerBuffer = await file.slice(0, 10).arrayBuffer();
      const header = new Uint8Array(headerBuffer);
      if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null;

      const version = header[3]; // 3 = ID3v2.3, 4 = ID3v2.4
      const tagSize = (header[6] << 21) | (header[7] << 14) | (header[8] << 7) | header[9];
      const totalSize = tagSize + 10;
      const tagArrayBuffer = await file.slice(0, totalSize).arrayBuffer();
      const tagBuffer = new Uint8Array(tagArrayBuffer);
      const view = new DataView(tagArrayBuffer);

      let offset = 10;
      const decoderLatin1 = new TextDecoder('iso-8859-1');
      while (offset + 10 <= tagBuffer.length) {
        const frameId = decoderLatin1.decode(tagBuffer.slice(offset, offset + 4));
        const rawSize = view.getUint32(offset + 4, false); // big-endian
        const frameSize = version === 4
          ? ((rawSize & 0x7f000000) >> 3) | ((rawSize & 0x007f0000) >> 2) | ((rawSize & 0x00007f00) >> 1) | (rawSize & 0x0000007f)
          : rawSize;
        const frameHeaderSize = 10;
        const frameStart = offset + frameHeaderSize;
        const frameEnd = frameStart + frameSize;
        if (frameEnd > tagBuffer.length || frameSize <= 0) break;

        if (frameId === 'APIC') {
          const encoding = tagBuffer[frameStart];
          // Determine encoding but don't assign unused textDecoder
          // const textDecoder = ... (unused)

          let cursor = frameStart + 1;
          const mimeEnd = tagBuffer.indexOf(0, cursor);
          const mime = mimeEnd !== -1 ? decoderLatin1.decode(tagBuffer.slice(cursor, mimeEnd)) : 'image/jpeg';
          cursor = mimeEnd !== -1 ? mimeEnd + 1 : cursor; // picture type
          cursor += 1;

          // Find description terminator respecting encoding
          const findTerminator = () => {
            if (encoding === 1 || encoding === 2) {
              for (let i = cursor; i + 1 < frameEnd; i += 2) {
                if (tagBuffer[i] === 0 && tagBuffer[i + 1] === 0) return i;
              }
              return -1;
            }
            return tagBuffer.indexOf(0, cursor);
          };

          const descEnd = findTerminator();
          cursor = descEnd !== -1 ? descEnd + (encoding === 1 || encoding === 2 ? 2 : 1) : cursor;

          if (cursor >= frameEnd) return null;

          const imageData = tagBuffer.slice(cursor, frameEnd);
          const blob = new Blob([imageData], { type: mime || 'image/jpeg' });
          return blob;
        }
        offset = frameEnd;
      }
      return null;
    } catch (error) {
      console.warn('Failed to extract cover art', error);
      return null;
    }
  }

  async checkMp3Header(file) {
    try {
      // Read first 10 bytes to check for ID3 header
      const headerSlice = file.slice(0, 10);
      const headerBuffer = await headerSlice.arrayBuffer();
      const headerBytes = new Uint8Array(headerBuffer);
      
      let startOffset = 0;
      
      // Check for ID3v2 container
      if (headerBytes[0] === 0x49 && headerBytes[1] === 0x44 && headerBytes[2] === 0x33) {
          // Parse ID3v2 size (synchsafe integer: 4 bytes, 7 bits each)
          const s1 = headerBytes[6];
          const s2 = headerBytes[7];
          const s3 = headerBytes[8];
          const s4 = headerBytes[9];
          const tagSize = (s1 << 21) | (s2 << 14) | (s3 << 7) | s4;
          // Skip ID3 tag + 10 byte header
          startOffset = tagSize + 10;
      }

      // Read a chunk after the ID3 tag (e.g., 4KB is usually enough for the first frame + VBR header)
      // We increased to 64KB before, but now that we skip ID3, 16KB-32KB might be enough.
      // Let's stick to a reasonable size to be safe.
      const searchLength = 16 * 1024; 
      const slice = file.slice(startOffset, startOffset + searchLength);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder('iso-8859-1').decode(bytes);
      
      if (text.includes('Xing') || text.includes('Info') || text.includes('VBRI')) {
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Failed to check MP3 header', e);
      return true; // Fail safe (assume valid to avoid annoying user if check fails)
    }
  }

  handleFiles(fileList) {
    const files = Array.from(fileList || []);
    let audioFile = null;
    let subtitleFile = null;
    const invalidFiles = [];

    files.forEach((file) => {
        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();
        const isMp3 = name.endsWith('.mp3') || type.includes('audio/mpeg');
        const isSrt = name.endsWith('.srt') || type.includes('application/x-subrip');

        if (isMp3) {
            audioFile = file;
        } else if (isSrt) {
            subtitleFile = file;
        } else {
            invalidFiles.push(file);
        }
    });

    if (audioFile) {
        Promise.all([this.checkMp3Header(audioFile), this.extractCoverArt(audioFile)])
            .then(([hasHeader, coverBlob]) => {
                const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : '';
                this.onAudioLoad(audioFile, hasHeader, coverUrl);
            });
    }
    if (subtitleFile) {
        this.onSubtitleLoad(subtitleFile);
    }

    return { audioFile, subtitleFile, invalidFiles };
  }
}

export default FileManager;
