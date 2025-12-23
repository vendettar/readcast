// src/libs/stopwords.ts
// English stopwords list derived from the "stopword" project (MIT licensed).
// Used to filter common words from dictionary lookup eligibility.

export const stopwordsSet = new Set([
    'about', 'after', 'all', 'also', 'am', 'an', 'and', 'another', 'any', 'are',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but',
    'by', 'came', 'can', 'come', 'could', 'did', 'do', 'each', 'for', 'from',
    'get', 'got', 'has', 'had', 'he', 'have', 'her', 'here', 'him', 'himself',
    'his', 'how', 'if', 'in', 'into', 'is', 'it', 'like', 'make', 'many',
    'me', 'might', 'more', 'most', 'much', 'must', 'my', 'never', 'now', 'of',
    'on', 'only', 'or', 'other', 'our', 'out', 'over', 'said', 'same', 'should',
    'since', 'some', 'still', 'such', 'take', 'than', 'that', 'the', 'their', 'them',
    'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
    'up', 'very', 'was', 'way', 'we', 'well', 'were', 'what', 'where', 'which',
    'while', 'who', 'with', 'would', 'you', 'your', 'a', 'i'
]);

/**
 * Check if a word is a stopword (common word that shouldn't trigger lookup)
 */
export function isStopword(word: string): boolean {
    return stopwordsSet.has(word.toLowerCase());
}
