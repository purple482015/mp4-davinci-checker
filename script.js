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

const goodVideoPatterns = [/avc1/i, /h264/i, /hvc1/i, /hev1/i, /prores/i, /apch|apcn|apco|apcs/i, /dnxhd|dnxhr/i];
const badVideoPatterns = [/divx/i, /flv1/i, /mjp/i, /mjpg/i, /theora/i, /vp8/i, /vp9/i, /rv20|rv30|rv40/i];

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

function evaluateCompatibility(videoCodec, audioCodec) {
  const normalizedVideo = String(videoCodec || '').toLowerCase();
  const normalizedAudio = String(audioCodec || '').toLowerCase();

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

  const isKnownGood = goodVideoPatterns.some((pattern) => pattern.test(normalizedVideo));
  const isKnownBad = badVideoPatterns.some((pattern) => pattern.test(normalizedVideo));

  if (isKnownBad) {
    return {
      level: 'bad',
      title: 'Likely incompatible',
      summary: `The detected video codec (${videoCodec}) is often problematic with DaVinci Resolve Free, especially in MP4 files. This file may need to be re-encoded before import.`,
      recommendations: [
        'Transcode to H.264 video and AAC audio in an MP4 container.',
        'Use a standard export preset from your editing app or converter.',
        'Test a short clip before converting the full file.'
      ]
    };
  }

  if (isKnownGood) {
    return {
      level: 'good',
      title: 'Likely compatible',
      summary: `The detected video codec (${videoCodec}) is a common format for DaVinci Resolve Free, and the file is likely usable in Resolve. Final compatibility may still depend on the exact file profile and audio stream.`,
      recommendations: [
        'Keep the MP4 container and standard codec profile.',
        'If the audio stream causes issues, convert it to AAC or PCM.',
        'Quick test a short clip before a full timeline import.'
      ]
    };
  }

  return {
    level: 'warning',
    title: 'Possible compatibility issue',
    summary: `The codec (${videoCodec}) is not a common DaVinci Resolve Free profile and may need a quick transcode test before editing.`,
    recommendations: [
      'Transcode to H.264 video and AAC audio in MP4 format.',
      'Export a fresh MP4 from your source editor if possible.',
      'Check compatibility with a small test clip before full project import.'
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
  const sourceName = selectedFile ? selectedFile.name : 'input.mp4';
  const outputName = sourceName.replace(/\.mp4$/i, '-h264-aac.mp4');
  const ffmpegCommand = `ffmpeg -i "${sourceName}" -c:v libx264 -preset medium -crf 20 -c:a aac -movflags +faststart "${outputName}"`;

  setStatus('Recommended export profile: H.264 + AAC in MP4', 'success');
  setBadge('warning', 'Best format');
  compatibilitySummary.textContent = 'This is the safest export profile for DaVinci Resolve Free when a file is unreadable, unusual, or needs re-encoding. The command uses the file you selected automatically.';
  recommendations.innerHTML = `
    <li>Use H.264 video.</li>
    <li>Use AAC audio.</li>
    <li>Keep the MP4 container.</li>
    <li>Use a standard preset or the FFmpeg command below.</li>
    <li><code>${ffmpegCommand}</code></li>
  `;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(ffmpegCommand).catch(() => {});
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

    const result = evaluateCompatibility(resultInfo.videoCodec, resultInfo.audioCodec);

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
