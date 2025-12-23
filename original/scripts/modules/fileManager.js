import { DB } from './db.js';

class FileManager {
  constructor({ onAudioLoad } = {}) {
    this.onAudioLoad = onAudioLoad;
  }

  generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Update session progress (sessionId is now the key)
  async updateProgress(sessionId, data) {
    if (!sessionId) return;
    try {
      await DB.updateSession(sessionId, data);
    } catch (err) {
      console.warn('Failed to update session progress', err);
    }
  }

  // --- File Processing Helpers ---

  async extractCoverArt(file) {
    try {
      const headerBuffer = await file.slice(0, 10).arrayBuffer();
      const header = new Uint8Array(headerBuffer);
      if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33)
        return null;

      const version = header[3];
      const tagSize =
        (header[6] << 21) | (header[7] << 14) | (header[8] << 7) | header[9];
      const totalSize = tagSize + 10;
      const tagArrayBuffer = await file.slice(0, totalSize).arrayBuffer();
      const tagBuffer = new Uint8Array(tagArrayBuffer);
      const view = new DataView(tagArrayBuffer);

      let offset = 10;
      const decoderLatin1 = new TextDecoder('iso-8859-1');
      while (offset + 10 <= tagBuffer.length) {
        const frameId = decoderLatin1.decode(
          tagBuffer.slice(offset, offset + 4)
        );
        const rawSize = view.getUint32(offset + 4, false);
        const frameSize =
          version === 4
            ? ((rawSize & 0x7f000000) >> 3) |
              ((rawSize & 0x007f0000) >> 2) |
              ((rawSize & 0x00007f00) >> 1) |
              (rawSize & 0x0000007f)
            : rawSize;
        const frameStart = offset + 10;
        const frameEnd = frameStart + frameSize;
        if (frameEnd > tagBuffer.length || frameSize <= 0) break;

        if (frameId === 'APIC') {
          const encoding = tagBuffer[frameStart];
          let cursor = frameStart + 1;
          const mimeEnd = tagBuffer.indexOf(0, cursor);
          const mime =
            mimeEnd !== -1
              ? decoderLatin1.decode(tagBuffer.slice(cursor, mimeEnd))
              : 'image/jpeg';
          cursor = mimeEnd !== -1 ? mimeEnd + 1 : cursor;
          cursor += 1;

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
          cursor =
            descEnd !== -1
              ? descEnd + (encoding === 1 || encoding === 2 ? 2 : 1)
              : cursor;

          if (cursor >= frameEnd) return null;

          const imageData = tagBuffer.slice(cursor, frameEnd);
          return new Blob([imageData], { type: mime || 'image/jpeg' });
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
      const headerSlice = file.slice(0, 10);
      const headerBuffer = await headerSlice.arrayBuffer();
      const headerBytes = new Uint8Array(headerBuffer);

      let startOffset = 0;
      if (
        headerBytes[0] === 0x49 &&
        headerBytes[1] === 0x44 &&
        headerBytes[2] === 0x33
      ) {
        const s1 = headerBytes[6];
        const s2 = headerBytes[7];
        const s3 = headerBytes[8];
        const s4 = headerBytes[9];
        const tagSize = (s1 << 21) | (s2 << 14) | (s3 << 7) | s4;
        startOffset = tagSize + 10;
      }

      const searchLength = 16 * 1024;
      const slice = file.slice(startOffset, startOffset + searchLength);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const text = new TextDecoder('iso-8859-1').decode(bytes);

      if (
        text.includes('Xing') ||
        text.includes('Info') ||
        text.includes('VBRI')
      ) {
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Failed to check MP3 header', e);
      return true;
    }
  }

  async validateAudioFile(file) {
    try {
      const buffer = await file.slice(0, 12).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // ID3
      if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
        return 'mp3';
      // MP3 Sync
      if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
      // ftyp (MP4)
      if (
        bytes[4] === 0x66 &&
        bytes[5] === 0x74 &&
        bytes[6] === 0x79 &&
        bytes[7] === 0x70
      )
        return 'mp4';
      return null;
    } catch {
      return null;
    }
  }

  async checkCapacity(incomingFileSize) {
    if (!navigator.storage || !navigator.storage.estimate) return true;

    try {
      const { usage, quota } = await navigator.storage.estimate();

      const USER_CAP = 1 * 1024 * 1024 * 1024; // 1GB
      const HARD_CAP = 2 * 1024 * 1024 * 1024; // 2GB
      const dynamicCap = quota * 0.2; // Conservative 20% of browser quota

      const finalCap = Math.min(USER_CAP, HARD_CAP, dynamicCap);

      if (usage + incomingFileSize > finalCap) {
        console.warn(
          `Storage limit reached. Usage: ${usage}, Incoming: ${incomingFileSize}, Cap: ${finalCap}`
        );
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Failed to check capacity', e);
      return true; // Fail open
    }
  }

  async createThumbnail(blob) {
      if (!blob) return null;
      try {
          const bitmap = await createImageBitmap(blob);
          const maxDim = 256;
          let width = bitmap.width;
          let height = bitmap.height;
          
          if (width > maxDim || height > maxDim) {
              const ratio = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
          }

          const canvas = new OffscreenCanvas(width, height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0, width, height);
          
          const thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
          bitmap.close();
          return thumbnail;
      } catch (e) {
          console.warn('Thumbnail generation failed', e);
          return blob; // Fallback to original if compression fails
      }
  }

  // --- Main Logic ---

  async handleFiles(fileList, { loadToUi = true, targetSessionId = null } = {}) {
    const files = Array.from(fileList || []);
    let audioFile = null;
    let subtitleFile = null;
    const invalidFiles = [];
    let errorType = null;
    const MAX_AUDIO_SIZE = 300 * 1024 * 1024; // 300MB

    for (const file of files) {
      const name = (file.name || '').toLowerCase();
      const type = (file.type || '').toLowerCase();

      const isSrt =
        name.endsWith('.srt') || type.includes('application/x-subrip');
      const isPotentialAudio =
        name.endsWith('.mp3') ||
        name.endsWith('.mp4') ||
        name.endsWith('.m4a') ||
        type.includes('audio/') ||
        type.includes('video/mp4');

      if (isSrt) {
        subtitleFile = file;
      } else if (isPotentialAudio) {
        const format = await this.validateAudioFile(file);
        if (format) {
          if (file.size > MAX_AUDIO_SIZE) {
            invalidFiles.push(file);
            if (!errorType) errorType = 'audioTooLarge';
          } else {
            audioFile = file;
          }
        } else {
          invalidFiles.push(file);
        }
      } else {
        invalidFiles.push(file);
      }
    }

    if (!errorType && invalidFiles.length > 0) {
      errorType = 'invalidFiles';
    }

    // Capacity Check
    if (audioFile) {
      const hasSpace = await this.checkCapacity(audioFile.size);
      if (!hasSpace) {
        return {
          audioFile: null,
          subtitleFile: null,
          invalidFiles: [],
          errorType: 'storageLimitReached',
        };
      }
    }

    let sessionId = targetSessionId;
    let createdSession = null;

    // SCENARIO: Audio + Maybe Subtitle
    if (audioFile) {
      // 1. Prepare Audio Data
      let hasHeader = true;
      let coverBlob = null;
      let thumbnailBlob = null;
      try {
        const [headerCheck, extractedCover] = await Promise.all([
          this.checkMp3Header(audioFile),
          this.extractCoverArt(audioFile),
        ]);
        hasHeader = headerCheck;
        coverBlob = extractedCover;
        if (coverBlob) {
            thumbnailBlob = await this.createThumbnail(coverBlob);
        }
      } catch (e) {
        console.warn('Metadata extraction failed', e);
      }

      // 2. Prepare Subtitle Data (if present)
      let subtitleId = null;
      let subtitleContent = null;
      if (subtitleFile) {
        try {
          subtitleContent = await subtitleFile.text();
          subtitleId = this.generateId();
          await DB.addSubtitle(subtitleId, subtitleContent, {
            name: subtitleFile.name,
          });
        } catch (e) {
          console.warn('Subtitle read failed', e);
        }
      }

      if (targetSessionId) {
          // UPDATE Existing Session
          await this.updateAudioInSession(targetSessionId, audioFile, { hasHeader, coverBlob: thumbnailBlob || coverBlob });
          // If simultaneous subtitle drop, attach it too
          if (subtitleId) {
             await DB.updateSession(targetSessionId, {
                 subtitleId,
                 subtitleName: subtitleFile.name,
                 subtitleSize: subtitleFile.size
             });
          }
      } else {
          // CREATE New Session
          sessionId = this.generateId();
          const audioId = this.generateId();

          // 3. Save Audio
          await DB.addAudio(audioId, audioFile, {
            hasHeader,
            cover: thumbnailBlob || coverBlob, 
            name: audioFile.name,
          });

          // 4. Create Session
          createdSession = {
            id: sessionId,
            title: audioFile.name,
            audioId,
            subtitleId,
            audioName: audioFile.name,
            subtitleName: subtitleFile ? subtitleFile.name : null,
            audioSize: audioFile.size,
            subtitleSize: subtitleFile ? subtitleFile.size : 0,
            duration: 0,
            progress: 0,
            cover: thumbnailBlob || coverBlob
          };

          await DB.createSession(sessionId, createdSession);
      }

      // 5. Load (optional)
      if (loadToUi && this.onAudioLoad) {
        // Prefer thumbnail for UI display to save memory, though original blob works too
        const displayBlob = thumbnailBlob || coverBlob;
        const coverUrl = displayBlob ? URL.createObjectURL(displayBlob) : '';
        this.onAudioLoad(audioFile, hasHeader, coverUrl, sessionId); // Pass SessionID!
      }
    }
    // SCENARIO: Only Subtitle (New Session)
    // NOTE: app.js will handle "attach to existing session" logic if audioFile is null.
    // If app.js decides to create a NEW session for this subtitle, it calls createSubtitleSession.

    return {
      audioFile,
      subtitleFile,
      invalidFiles,
      errorType,
      sessionId,
      createdSession,
    };
  }

  async updateAudioInSession(sessionId, audioFile, { hasHeader, coverBlob }) {
      const audioId = this.generateId();
      await DB.addAudio(audioId, audioFile, {
          hasHeader,
          cover: coverBlob,
          name: audioFile.name
      });
      await DB.updateSession(sessionId, {
          audioId,
          audioName: audioFile.name,
          audioSize: audioFile.size,
          duration: 0,
          progress: 0,
          cover: coverBlob
      });
  }

  // Create a session for a standalone subtitle
  async createSubtitleSession(filename, content) {
    const sessionId = this.generateId();
    const subtitleId = this.generateId();
    const subtitleSize = new Blob([content]).size;

    try {
      await DB.addSubtitle(subtitleId, content, { name: filename });
      await DB.createSession(sessionId, {
        title: filename,
        audioId: null,
        subtitleId: subtitleId,
        subtitleName: filename,
        subtitleSize,
      });
      return sessionId;
    } catch (e) {
      console.warn('Failed to create subtitle session', e);
      return null;
    }
  }

  // Attach a subtitle to an existing session
  async attachSubtitleToSession(sessionId, filename, content) {
    if (!sessionId) return;
    const subtitleId = this.generateId();
    const subtitleSize = new Blob([content]).size;
    try {
      await DB.addSubtitle(subtitleId, content, { name: filename });
      await DB.updateSession(sessionId, {
        subtitleId,
        subtitleName: filename,
        subtitleSize,
      });
    } catch (e) {
      console.warn('Failed to attach subtitle', e);
    }
  }

  async loadRecent() {
    try {
      const sessions = await DB.getAllSessions();
      if (sessions && sessions.length > 0) {
        const session = sessions[0];
        const result = { session }; // Container for return data

        // Load Audio
        if (session.audioId) {
          const audioData = await DB.getAudio(session.audioId);
          if (audioData) {
            const file = new File([audioData.blob], audioData.name, {
              type: audioData.type,
            });
            const coverUrl = audioData.cover
              ? URL.createObjectURL(audioData.cover)
              : '';

            if (this.onAudioLoad) {
              this.onAudioLoad(file, audioData.hasHeader, coverUrl, session.id);
            }
            result.audioLoaded = true;
          }
        }

        // Load Subtitle
        if (session.subtitleId) {
          const subData = await DB.getSubtitle(session.subtitleId);
          if (subData) {
            result.subtitleContent = subData.content;
          }
        }

        return result;
      }
    } catch (err) {
      console.error('Failed to load recent session:', err);
    }
    return null;
  }

  async deleteSession(sessionId) {
      if (!sessionId) return;
      try {
          const session = await DB.getSession(sessionId);
          if (session) {
              if (session.audioId) await DB.deleteAudio(session.audioId);
              if (session.subtitleId) await DB.deleteSubtitle(session.subtitleId);
          }
          await DB.deleteSession(sessionId);
      } catch (err) {
          console.warn('Failed to delete session', err);
      }
  }
}

export default FileManager;
