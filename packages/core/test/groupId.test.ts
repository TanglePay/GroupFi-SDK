import CryptoJS from 'crypto-js';
import { isGroupIdEqual, prefixedGroupIdToGroupId } from '../src/groupId';
import { describe, it, expect } from '@jest/globals';

describe('isGroupIdEqual', () => {
    it('should handle real group IDs correctly', () => {
        const groupIdCouldBeLegacy = 'groupfiGFTEST152f18a648e9ef080040a6bb2e76c4812d8514cc0bb9bed7a75c92e1b6b354caf';
        const groupIdFromApi = 'groupfiGFTEST174261f5d901dad676f614d8c368bb51dc9a99d176b5387f9703159d5ba164bc3';
        
        expect(isGroupIdEqual(groupIdCouldBeLegacy, groupIdFromApi)).toBe(true);
    });
}); 