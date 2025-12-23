export const GALLERY_FEED_ALLOW_HOSTS = [
    'feeds.simplecast.com',
    'feeds.megaphone.fm',
    'rss.art19.com'
];

export const GALLERY_FEED_BLOCK_HOSTS = [
    'feeds.npr.org'
];

export function getHostFromUrl(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

export function isHostListed(host, list) {
    const needle = (host || '').toLowerCase();
    if (!needle) return false;
    return (list || []).some((entry) => {
        const candidate = String(entry || '').toLowerCase();
        if (!candidate) return false;
        if (needle === candidate) return true;
        return needle.endsWith(`.${candidate}`);
    });
}
