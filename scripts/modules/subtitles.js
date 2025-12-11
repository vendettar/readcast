const blockRegex = /\d+\s+((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s-->\s((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s+([\s\S]*?)(?=\n\s*\n|\n*$|$)/g;

export function parseSrt(content) {
    if (!content) return [];
    
    // Normalize line endings
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    blockRegex.lastIndex = 0;
    const subtitles = [];
    let match;

    while ((match = blockRegex.exec(normalizedContent)) !== null) {
        const rawStart = match[1];
        const rawEnd = match[2];
        const text = match[3].replace(/<[^>]*>/g, '').trim();
        subtitles.push({
            start: timeToSeconds(rawStart),
            end: timeToSeconds(rawEnd),
            text,
            rawStart,
            rawEnd
        });
    }

    return subtitles;
}

export function findSubtitleIndex(subtitles, time, currentIndex) {
    if (!subtitles.length) return -1;

    if (currentIndex >= 0 && currentIndex < subtitles.length) {
        const current = subtitles[currentIndex];
        if (time >= current.start && time < current.end) {
            return currentIndex;
        }
    }

    if (currentIndex + 1 < subtitles.length) {
        const next = subtitles[currentIndex + 1];
        if (time >= next.start && time < next.end) {
            return currentIndex + 1;
        }
    }

    if (currentIndex - 1 >= 0) {
        const prev = subtitles[currentIndex - 1];
        if (time >= prev.start && time < prev.end) {
            return currentIndex - 1;
        }
    }

    let left = 0;
    let right = subtitles.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const subtitle = subtitles[mid];

        if (time >= subtitle.start && time < subtitle.end) {
            return mid;
        } else if (time < subtitle.start) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    return -1;
}

export function formatTimeLabel(rawTime) {
    if (!rawTime) return '';
    const firstPart = rawTime.split(/[,.]/)[0];
    const parts = firstPart.split(':');
    if (parts.length === 3 && parts[0] === '00') {
        return `${parts[1]}:${parts[2]}`;
    }
    return firstPart;
}

function timeToSeconds(timeStr) {
    const normalized = timeStr.replace(',', '.');
    const parts = normalized.split(':');
    if (parts.length === 3) {
        return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    }
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
}
