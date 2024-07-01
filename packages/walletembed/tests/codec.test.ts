
import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import  GroupfiWalletembed from '../src/index'
test('Encryption and decryption using password should work correctly', () => {
    const data = 'This is a test string';
    const password = 'strongpassword123';

    const encryptedData = GroupfiWalletembed.encryptDataUsingPassword(data, password);
    expect(encryptedData).toBeDefined();
    expect(encryptedData).not.toBe(data);

    const decryptedData = GroupfiWalletembed.decryptDataUsingPassword(encryptedData, password);
    expect(decryptedData).toBe(data);
});

test('Decryption with wrong password should fail', () => {
    const data = 'This is a test string';
    const password = 'strongpassword123';
    const wrongPassword = 'wrongpassword';

    const encryptedData = GroupfiWalletembed.encryptDataUsingPassword(data, password);
    expect(encryptedData).toBeDefined();

    const decryptedData = GroupfiWalletembed.decryptDataUsingPassword(encryptedData, wrongPassword);
    expect(decryptedData).not.toBe(data);
    expect(decryptedData).toBe('');
});