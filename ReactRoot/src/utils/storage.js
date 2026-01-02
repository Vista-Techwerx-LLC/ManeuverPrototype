import { supabase } from '../lib/supabase'

/**
 * Get the public download URL for MSFS-Bridge.exe from Supabase storage
 * @returns {Promise<string|null>} Public URL to download the file, or null if error
 */
export async function getBridgeDownloadUrl() {
  try {
    const bucketName = 'downloads'
    const fileName = 'MSFS-Bridge.exe'
    
    // Get public URL for the file
    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .getPublicUrl(fileName)
    
    if (error) {
      console.error('Error getting download URL:', error)
      return null
    }
    
    return data.publicUrl
  } catch (error) {
    console.error('Error accessing storage:', error)
    return null
  }
}

/**
 * Download a file from Supabase storage
 * @param {string} bucketName - Name of the storage bucket
 * @param {string} fileName - Name of the file to download
 * @returns {Promise<Blob|null>} File blob or null if error
 */
export async function downloadFile(bucketName, fileName) {
  try {
    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .download(fileName)
    
    if (error) {
      console.error('Error downloading file:', error)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Error downloading file:', error)
    return null
  }
}

