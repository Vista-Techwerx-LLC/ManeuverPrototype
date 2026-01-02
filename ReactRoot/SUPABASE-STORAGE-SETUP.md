# Supabase Storage Setup Guide

This guide explains how to set up Supabase Storage to host the MSFS-Bridge.exe file for user downloads.

## Step 1: Create Storage Bucket

1. Go to your Supabase project dashboard
2. Click **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `downloads` (must match exactly)
   - **Public bucket**: ✅ **Enable this** (so users can download without authentication)
   - **File size limit**: Set to accommodate your exe file (e.g., 50 MB)
   - **Allowed MIME types**: Leave empty or add `application/x-msdownload` for .exe files
5. Click **Create bucket**

## Step 2: Upload MSFS-Bridge.exe

1. In the Storage section, click on the `downloads` bucket
2. Click **Upload file**
3. Select your `MSFS-Bridge.exe` file
4. **Important**: The file must be named exactly `MSFS-Bridge.exe` (case-sensitive)
5. Click **Upload**

## Step 3: Verify Public Access

1. After uploading, click on the file in the bucket
2. Copy the **Public URL** - it should look like:
   ```
   https://[your-project].supabase.co/storage/v1/object/public/downloads/MSFS-Bridge.exe
   ```
3. Test the URL in a browser - it should download the file

## Step 4: Set Up Storage Policies (Optional but Recommended)

If you want to restrict downloads to authenticated users only:

1. Go to **Storage** → **Policies** tab
2. Click on the `downloads` bucket
3. Click **New Policy**
4. Choose **For SELECT operations**
5. Use this policy:

```sql
-- Allow authenticated users to download files
CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'downloads' 
  AND auth.role() = 'authenticated'
);
```

**Note**: If you made the bucket public, this policy is optional. Public buckets allow anyone to download.

## Step 5: Test the Integration

1. Start your React app: `npm run dev`
2. Sign in to your account
3. Go to the Dashboard
4. You should see a "Download MSFS-Bridge.exe" button in the setup instructions
5. Click it to verify the download works

## Troubleshooting

### File not found error
- Verify the bucket name is exactly `downloads`
- Verify the file name is exactly `MSFS-Bridge.exe`
- Check that the file uploaded successfully

### Access denied error
- Ensure the bucket is set to **Public**
- Or ensure you have the correct storage policy for authenticated users
- Check that your Supabase anon key has storage permissions

### Download button doesn't appear
- Check browser console for errors
- Verify `getBridgeDownloadUrl()` is returning a valid URL
- Ensure Supabase client is properly configured

## Alternative: Using a Different Bucket Name

If you want to use a different bucket name:

1. Update `ReactRoot/src/utils/storage.js`:
   ```javascript
   const bucketName = 'your-bucket-name' // Change this
   ```

2. Create the bucket with your chosen name in Supabase

3. Upload the file to that bucket

## File Updates

When you need to update MSFS-Bridge.exe:

1. Go to Storage → downloads bucket
2. Delete the old `MSFS-Bridge.exe` file
3. Upload the new version with the same name
4. The download link will automatically use the new version

---

**That's it!** Your users can now download MSFS-Bridge.exe directly from the Dashboard.

