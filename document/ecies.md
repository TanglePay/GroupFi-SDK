# Groupfi ECIES Process Flow Chart

- **Key Generation**
  - `Sender` -> Generates Ed25519 public/private key pair
  - `Receiver` -> Generates Ed25519 public/private key pair

- **Encryption Process (Sender's Side)**
  1. Generate a random Ed25519 key pair
     - `Sender Temporary Key Pair` -> Ed25519
  2. Derive shared secret
     - `Sender Temporary Private Key` + `Receiver Public Key` -> Shared Secret
  3. Key Derivation Function (KDF)
     - `Shared Secret` -> KDF -> AES Symmetric Encryption Key
  4. Encrypt message
     - `Plaintext Message` + `AES Key` -> AES Encryption -> Encrypted Message
  5. Transmit
     - `Encrypted Message` + `Sender Temporary Public Key` -> Transmission to Receiver

- **Decryption Process (Receiver's Side)**
  1. Derive the same shared secret
     - `Sender Temporary Public Key` + `Receiver Private Key` -> Shared Secret
  2. Key Derivation Function (KDF)
     - `Shared Secret` -> KDF -> AES Symmetric Encryption Key
  3. Decrypt message
     - `Encrypted Message` + `AES Key` -> AES Decryption -> Plaintext Message
