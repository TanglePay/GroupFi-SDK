
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