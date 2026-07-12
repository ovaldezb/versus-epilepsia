'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');

const BUCKET_NAME = process.env.S3_BUCKET_COMPROBANTES || 'versus-epilepsia-comprobantes';
const REGION = process.env.AWS_REGION || 'us-west-1';

const s3 = new S3Client({ region: REGION });

/**
 * Downloads media from WhatsApp Cloud API and uploads it to S3.
 * @param {string} mediaId  - WhatsApp media ID
 * @param {string} phoneNumber - Sender phone (used for filename)
 * @param {string} mimeType - MIME type (e.g. 'image/jpeg')
 * @returns {Promise<string>} - Public S3 URL
 */
const uploadPaymentProof = async (mediaId, phoneNumber, mimeType = 'image/jpeg') => {
    const token = process.env.WHATSAPP_TOKEN;

    console.log(`[S3] Starting upload. mediaId=${mediaId}, mimeType=${mimeType}`);

    // Step 1: Get download URL from Meta
    const mediaInfoRes = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const downloadUrl = mediaInfoRes.data.url;
    console.log('[S3] Got Meta download URL');

    // Step 2: Download the file as binary buffer
    const fileResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${token}` }
    });
    const buffer = Buffer.from(fileResponse.data);
    console.log(`[S3] Downloaded file from Meta, size=${buffer.length} bytes`);

    // Step 3: Build the S3 key (path inside bucket)
    const extMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
    };
    const ext = extMap[mimeType] || 'jpg';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `comprobantes/comprobante_${phoneNumber}_${timestamp}.${ext}`;

    // Step 4: Upload to S3
    await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType
    }));

    // Step 5: Build the public URL
    const url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
    console.log(`[S3] Uploaded successfully. Public URL: ${url}`);
    return url;
};

module.exports = { uploadPaymentProof };
