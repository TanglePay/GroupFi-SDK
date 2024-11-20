export async function getPresignedUploadUrl({
    serviceUrl,
    publicKey,
    signature,
    message,
    ext
}: {
    serviceUrl: string;
    publicKey: string;
    signature: string;
    message: string;
    ext: string;
}): Promise<{ uploadURL: string; imageURL: string }> {
    const body = { publicKey, signature, message, ext };
    
    const response = await fetch(serviceUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        console.error(`Failed to get presigned upload URL from ${serviceUrl}: ${response.statusText}`);
        throw new Error('Failed to get presigned upload URL');
    }

    const json = await response.json() as { uploadURL: string };
    const { uploadURL } = json;

    // Derive the S3 URI by removing the query parameters from the upload URL
    const imageURL = uploadURL.split('?')[0];

    return { uploadURL, imageURL };
}