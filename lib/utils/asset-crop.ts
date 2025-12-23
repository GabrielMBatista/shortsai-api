import sharp from 'sharp';

const TARGET_ASPECT = 9 / 16; // 0.5625 (vertical video)
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

/**
 * Crops and resizes an image to 9:16 aspect ratio (1080x1920)
 * using center crop to avoid distortion
 */
export async function cropImageTo9x16(buffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
        throw new Error('Could not read image dimensions');
    }

    const currentAspect = metadata.width / metadata.height;

    let cropWidth = metadata.width;
    let cropHeight = metadata.height;

    // If wider than target, crop width (center crop)
    if (currentAspect > TARGET_ASPECT) {
        cropWidth = Math.round(metadata.height * TARGET_ASPECT);
    }
    // If taller than target, crop height (center crop)
    else if (currentAspect < TARGET_ASPECT) {
        cropHeight = Math.round(metadata.width / TARGET_ASPECT);
    }

    // Calculate center crop position
    const left = Math.round((metadata.width - cropWidth) / 2);
    const top = Math.round((metadata.height - cropHeight) / 2);

    // Crop to aspect ratio, then resize to target dimensions
    const processedBuffer = await sharp(buffer)
        .extract({
            left,
            top,
            width: cropWidth,
            height: cropHeight
        })
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
            fit: 'cover',
            position: 'center'
        })
        .jpeg({ quality: 90 })
        .toBuffer();

    return processedBuffer;
}
