export interface IMMessage {
    schemaVersion: number; // 0 or 1, 1 byte
    group: string; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients: {addr:string,key:string}[];
    data: string[];
}
export const ShimmerBech32Addr = 1
export const ShimmerEvmAddr = 2
export type Address = {
    type: typeof ShimmerBech32Addr | typeof ShimmerEvmAddr
    addr: string
}