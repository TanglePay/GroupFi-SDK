declare interface IMMessage {
    schemaVersion: number; // 0 or 1, 1 byte
    group: string; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients: {addr:string,key:string}[];
    data: string[];
}