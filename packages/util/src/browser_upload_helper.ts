
// import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
export const getFileForUpload = async ()=>{
    // create a file input element, click it and get the file, then remove the element
    const input = document.createElement('input');
    input.type = 'file';
    input.click();
    const selectedFileArray = await new Promise<File>((resolve, rejects)=>{
        input.onchange = (e)=>{
            const files = (e.target as HTMLInputElement).files;
            if(files && files.length > 0){
                resolve(files[0]);
            } else {
                rejects('No file selected');
            }
        }
    });
    input.remove();
    return selectedFileArray;
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
  
      reader.onload = (event) => {
        img.onload = () => {
          resolve({ width: img.width, height: img.height });
        };
        img.onerror = (err) => {
          reject(new Error("Failed to load image."));
        };
        if (event.target && typeof event.target.result === 'string') {
          img.src = event.target.result;
        } else {
          reject(new Error("Failed to read file."));
        }
      };
  
      reader.onerror = (err) => {
        reject(new Error("Failed to read file."));
      };
  
      reader.readAsDataURL(file);
    });
  }
  
  export async function checkImageExists(imageUrl: string): Promise<boolean> {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (response.ok) {
        console.log('Image exists.');
        return true;
      } else {
        console.log('Image does not exist.');
        return false;
      }
    } catch (error) {
      console.error('Error checking if image exists:', error);
      return false;
    }
  }

  

// const s3Client = new S3Client({
//   region: 'us-east-2',
//   useAccelerateEndpoint: true,
// });

// async function checkIfObjectExists(url: string): Promise<boolean> {
//   try {
//     // Parse the URL to extract bucket name and object key
//     const { hostname, pathname } = new URL(url);
//     const bucketName = hostname.split('.')[0];
//     const objectKey = pathname.substring(1);

//     // Create the command
//     const command = new HeadObjectCommand({ Bucket: bucketName, Key: objectKey });

//     // Send the command
//     await s3Client.send(command);

//     // If the command succeeds, the object exists
//     return true;
//   } catch (error) {
//     // If a NotFound error is thrown, the object does not exist
//     if (error.name === "NotFound") {
//       return false;
//     } else {
//       // Handle other errors
//       console.error("An error occurred:", error);
//       throw error;
//     }
//   }
// }