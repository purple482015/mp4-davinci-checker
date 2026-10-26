const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const statusBox = document.getElementById('status');
const compatibilityBadge = document.getElementById('compatibilityBadge');
const compatibilitySummary = document.getElementById('compatibilitySummary');
const recommendations = document.getElementById('recommendations');
const exportPresetButton = document.getElementById('exportPresetButton');

const fileNameEl = document.getElementById('fileName');
const fileFormatEl = document.getElementById('fileFormat');
const durationEl = document.getElementById('duration');
const resolutionEl = document.getElementById('resolution');
const videoCodecEl = document.getElementById('videoCodec');
const audioCodecEl = document.getElementById('audioCodec');

let selectedFile = null;

const goodVideoPatterns = [
  /avc1/i, /avc3/i, /h264/i, /h\.264/i,
  /hvc1/i, /hev1/i, /h265/i, /hevc/i, /mpeg-4/i,
  /prores/i, /apch|apcn|apco|apcs/i, /dnxhd|dnxhr/i
];

const warningVideoPatterns = [
  /mpeg2/i, /mpeg-2/i, /mp4v/i, /mp4v-esp/i, /av01/i,
  /msmpeg/i, /wmv/i, /vc1/i
];

const badVideoPatterns = [
  /divx/i, /xvid/i, /flv1/i, /mjp/i, /mjpg/i, /theora/i,
  /vp8/i, /vp9/i, /rv20|rv30|rv40/i, /mjpeg/i,
  /3ivx/i, /fmp4/i
];

const goodAudioPatterns = [/aac/i, /mp4a/i, /pcm/i, /lpcm/i, /opus/i, /mp3/i];
const warningAudioPatterns = [/eac3/i, /ac3/i, /wav/i];

function setStatus(message, type = '') {
  statusBox.textContent = message;
  statusBox.className = 'status';
  if (type) statusBox.classList.add(type);
  statusBox.classList.remove('hidden');
}

function setBadge(level, text) {
  compatibilityBadge.className = 'compatibility-badge';
  compatibilityBadge.classList.add(level);
  compatibilityBadge.textContent = text;
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'Unknown';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function updateMetadata(file, info) {
  fileNameEl.textContent = file.name || 'Unknown file';
  fileFormatEl.textContent = file.type || 'application/octet-stream';
  durationEl.textContent = formatDuration(info.duration || 0);
  resolutionEl.textContent = info.width && info.height ? `${info.width} × ${info.height}` : 'Unknown';
  videoCodecEl.textContent = info.videoCodec || 'Unknown';
  audioCodecEl.textContent = info.audioCodec || 'Unknown';
}

function generateExportCommand(file) {
  if (!file) {
    return 'ffmpeg -i "input.mp4" -c:v libx264 -preset medium -crf 20 -c:a aac -movflags +faststart "output-h264-aac.mp4"';
  }

  const name = file.name || 'input.mp4';
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const outputName = `${withoutExt}-h264-aac.mp4`;
  return `ffmpeg -y -i "${name}" -c:v libx264 -preset medium -crf 20 -c:a aac -movflags +faststart "${outputName}"`;
}

function evaluateCompatibility(videoCodec, audioCodec, width, height) {
  const normalizedVideo = String(videoCodec || '').toLowerCase();
  const normalizedAudio = String(audioCodec || '').toLowerCase();

  const isGoodVideo = goodVideoPatterns.some((pattern) => pattern.test(normalizedVideo));
  const isWarningVideo = warningVideoPatterns.some((pattern) => pattern.test(normalizedVideo));
  const isBadVideo = badVideoPatterns.some((pattern) => pattern.test(normalizedVideo));

  const isGoodAudio = goodAudioPatterns.some((pattern) => pattern.test(normalizedAudio));
  const isWarningAudio = warningAudioPatterns.some((pattern) => pattern.test(normalizedAudio));

  if (!normalizedVideo || normalizedVideo === 'unknown') {
    return {
      level: 'warning',
      title: 'Needs a manual check',
      summary: 'The file did not expose enough metadata for a confident compatibility verdict. It may still work in DaVinci Resolve Free if it is a standard MP4 export.',
      recommendations: [
        'Export the file as H.264 + AAC in MP4 format.',
        'Try the file in Resolve before editing a long timeline.',
        'If it fails, re-encode the source using a standard profile.'
      ]
    };
  }

  if (isBadVideo) {
    return {
      level: 'bad',
      title: 'Likely incompatible',
      summary: `The detected video codec (${videoCodec}) is often problematic with DaVinci Resolve Free. This file should usually be re-encoded as H.264/AAC MP4 before import.`,
      recommendations: [
        'Transcode to H.264 video and AAC audio in an MP4 container.',
        'Use a standard export preset from your editor or converter.',
        'Test a short clip first before converting the whole file.'
      ]
    };
  }

  if (isGoodVideo && (isGoodAudio || isWarningAudio || !normalizedAudio || normalizedAudio === 'unknown')) {
    return {
      level: 'good',
      title: 'Likely compatible',
      summary: `The detected codec profile (${videoCodec}) is a common Resolve-friendly option. The file is likely usable in DaVinci Resolve Free, especially when saved as H.264/AAC MP4.`,
      recommendations: [
        'Keep the MP4 container and standard codec profile.',
        'If audio issues appear, convert audio to AAC or PCM.',
        'Quickly test a short clip before a full project import.'
      ]
    };
  }

  if (isWarningVideo || isWarningAudio) {
    return {
      level: 'warning',
      title: 'Possible compatibility issue',
      summary: `The file uses a codec profile (${videoCodec}, ${audioCodec}) that may work, but it is not the safest option for DaVinci Resolve Free. Re-exporting as H.264/AAC MP4 is recommended.`,
      recommendations: [
        'Re-export as H.264 video and AAC audio in MP4.',
        'Try a short test clip in Resolve before importing a large timeline.',
        'If it still behaves oddly, convert the file to a standard MP4 preset.'
      ]
    };
  }

  if (width && height && width > 0 && height > 0) {
    return {
      level: 'warning',
      title: 'Possible compatibility issue',
      summary: `The file appears to be a valid MP4, but the codec metadata is uncommon enough that a quick re-encode is the safest path for DaVinci Resolve Free.`,
      recommendations: [
        'Export as H.264 video and AAC audio in MP4 format.',
        'Use a standard preset from your editor or a converter such as HandBrake.',
        'Import a short test clip before committing a full project.'
      ]
    };
  }

  return {
    level: 'warning',
    title: 'Needs a manual check',
    summary: 'The browser could read the file as MP4, but not enough codec information was exposed to give a confident verdict. A quick export to H.264/AAC MP4 is recommended.',
    recommendations: [
      'Re-export to H.264 + AAC in MP4 format.',
      'Try a short clip in DaVinci Resolve Free before editing a long project.',
      'If the file still fails, convert it with a standard preset.'
    ]
  };
}

function parseMp4(file) {
  return new Promise((resolve) => {
    if (!window.MP4Box) {
      resolve({ duration: 0, width: 0, height: 0, videoCodec: 'Unknown', audioCodec: 'Unknown' });
      return;
    }

    try {
      const mp4box = window.MP4Box.createFile();

      mp4box.onError = () => {
        resolve({ duration: 0, width: 0, height: 0, videoCodec: 'Unknown', audioCodec: 'Unknown' });
      };

      mp4box.onReady = (info) => {
        const videoTrack = info?.tracks?.find((track) => track.type === 'video');
        const audioTrack = info?.tracks?.find((track) => track.type === 'audio');

        resolve({
          duration: info?.duration || 0,
          width: videoTrack?.video?.width || 0,
          height: videoTrack?.video?.height || 0,
          videoCodec: videoTrack?.codec || 'Unknown',
          audioCodec: audioTrack?.codec || 'Unknown'
        });
      };

      file.arrayBuffer()
        .then((buffer) => {
          mp4box.appendBuffer(buffer);
          mp4box.flush();
        })
        .catch(() => {
          resolve({ duration: 0, width: 0, height: 0, videoCodec: 'Unknown', audioCodec: 'Unknown' });
        });
    } catch (error) {
      resolve({ duration: 0, width: 0, height: 0, videoCodec: 'Unknown', audioCodec: 'Unknown' });
    }
  });
}

function readVideoMetadata(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);

    video.preload = 'metadata';
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const info = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0
      };
      URL.revokeObjectURL(objectUrl);
      resolve(info);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ duration: 0, width: 0, height: 0 });
    };
  });
}

function showExportPreset() {
  const command = generateExportCommand(selectedFile);

  setStatus('Recommended export profile: H.264 + AAC in MP4', 'success');
  setBadge('warning', 'Best format');
  compatibilitySummary.textContent = 'This is the safest export profile for DaVinci Resolve Free when a file is unreadable, unusual, or needs re-encoding. The command uses the file you selected automatically.';
  recommendations.innerHTML = `
    <li>Use H.264 video.</li>
    <li>Use AAC audio.</li>
    <li>Keep the MP4 container.</li>
    <li>Use a standard preset or the FFmpeg command below.</li>
    <li><code>${command}</code></li>
  `;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(command).catch(() => {});
  }
}

async function analyzeFile(file) {
  if (!file) return;

  selectedFile = file;

  const isMp4 = file.name.toLowerCase().endsWith('.mp4') || file.type === 'video/mp4';
  if (!isMp4) {
    setStatus('This is not an MP4 file.', 'error');
    setBadge('warning', 'Not an MP4');
    compatibilitySummary.textContent = 'Please upload a valid MP4 file to run the compatibility check.';
    recommendations.innerHTML = '<li>Use a .mp4 file.</li>';
    return;
  }

  setStatus('Analyzing MP4…', 'success');

  try {
    const [nativeInfoResult, mp4InfoResult] = await Promise.allSettled([
      readVideoMetadata(file),
      parseMp4(file)
    ]);

    const nativeInfo = nativeInfoResult.status === 'fulfilled' ? nativeInfoResult.value : { duration: 0, width: 0, height: 0 };
    const mp4Info = mp4InfoResult.status === 'fulfilled' ? mp4InfoResult.value : { duration: 0, width: 0, height: 0, videoCodec: 'Unknown', audioCodec: 'Unknown' };

    const resultInfo = {
      duration: mp4Info.duration || nativeInfo.duration || 0,
      width: mp4Info.width || nativeInfo.width || 0,
      height: mp4Info.height || nativeInfo.height || 0,
      videoCodec: mp4Info.videoCodec || 'Unknown',
      audioCodec: mp4Info.audioCodec || 'Unknown'
    };

    updateMetadata(file, resultInfo);

    const result = evaluateCompatibility(resultInfo.videoCodec, resultInfo.audioCodec, resultInfo.width, resultInfo.height);

    setBadge(
      result.level === 'good' ? 'good' :
      result.level === 'bad' ? 'bad' :
      result.level === 'warning' ? 'warning' : 'neutral',
      result.title
    );

    compatibilitySummary.textContent = result.summary;
    recommendations.innerHTML = result.recommendations.map((item) => `<li>${item}</li>`).join('');
    setStatus('Analysis complete.', 'success');
  } catch (error) {
    console.error(error);
    setStatus('This MP4 could not be fully analyzed. Try another file or re-export it.', 'error');
    setBadge('warning', 'Unknown');
    compatibilitySummary.textContent = 'The browser could not parse the MP4 metadata cleanly. This often happens with unusual or damaged files.';
    recommendations.innerHTML = `
      <li>Re-export the video as H.264 + AAC in MP4 format.</li>
      <li>Try a different file if the original seems corrupt.</li>
      <li>Use a short test clip before using the file in a full DaVinci Resolve project.</li>
    `;
  }
}

function handleFileSelection(fileList) {
  if (!fileList || !fileList.length) return;
  analyzeFile(fileList[0]);
}

exportPresetButton.addEventListener('click', showExportPreset);

fileInput.addEventListener('change', (event) => {
  handleFileSelection(event.target.files);
});

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.style.borderColor = '#6bb5ff';
});

dropzone.addEventListener('dragleave', () => {
  dropzone.style.borderColor = 'rgba(107, 181, 255, 0.48)';
});

dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.style.borderColor = 'rgba(107, 181, 255, 0.48)';
  handleFileSelection(event.dataTransfer.files);
});
