document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('overlay');
    const proctorStatus = document.getElementById('proctor-status');
    const submitBtn = document.getElementById('submit-btn');
    const ctx = canvas.getContext('2d');
    let lookingAwayStart = null;

    // Initialize MediaPipe Face Mesh
    const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    // Start webcam using MediaPipe Camera Utils
    const camera = new Camera(video, {
        onFrame: async () => {
            await faceMesh.send({ image: video });
        },
        width: 320,
        height: 240
    });

    // Start the camera
    camera.start()
        .then(() => {
            proctorStatus.textContent = 'Proctoring Active...';
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        })
        .catch(err => {
            console.error('Camera error:', err);
            if (err.name === 'NotAllowedError') {
                proctorStatus.textContent = 'Webcam access denied. Please allow camera access.';
            } else if (err.name === 'NotFoundError') {
                proctorStatus.textContent = 'No webcam found on this device.';
            } else {
                proctorStatus.textContent = 'Webcam error: ' + err.message;
            }
            proctorStatus.classList.add('flag');
        });

    // Process MediaPipe results
    function onResults(results) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            flagEvent('No face detected', 'warning');
            lookingAwayStart = null;
            return;
        }

        if (results.multiFaceLandmarks.length > 1) {
            flagEvent('Multiple faces detected', 'flag');
            lookingAwayStart = null;
            return;
        }

        // Single face detected
        const landmarks = results.multiFaceLandmarks[0];

        // Eye landmarks (MediaPipe indices for left and right eyes)
        const leftEyeInner = landmarks[33];  // Left eye inner corner
        const leftEyeOuter = landmarks[133]; // Left eye outer corner
        const rightEyeInner = landmarks[362]; // Right eye inner corner
        const rightEyeOuter = landmarks[263]; // Right eye outer corner
        const noseTip = landmarks[1]; // Nose tip for head pose

        // Calculate eye centers
        const leftEyeCenterX = (leftEyeInner.x + leftEyeOuter.x) / 2;
        const rightEyeCenterX = (rightEyeInner.x + rightEyeOuter.x) / 2;
        const eyeCenterX = (leftEyeCenterX + rightEyeCenterX) / 2;

        // Normalize coordinates to video dimensions
        const videoWidth = video.videoWidth;
        const normalizedEyeCenterX = eyeCenterX * videoWidth;
        const normalizedNoseX = noseTip.x * videoWidth;

        // Gaze detection: Check if eyes deviate significantly from center or head is tilted
        const gazeThresholdX = videoWidth * 0.15; // 15% of video width
        const headTiltThreshold = videoWidth * 0.1; // 10% for head tilt

        const isLookingAway = Math.abs(normalizedEyeCenterX - normalizedNoseX) > headTiltThreshold ||
                             Math.abs(normalizedEyeCenterX - (videoWidth / 2)) > gazeThresholdX;

        if (isLookingAway) {
            if (!lookingAwayStart) lookingAwayStart = Date.now();
            if (Date.now() - lookingAwayStart >= 3000) { // 3 seconds
                flagEvent('Looked away for 3+ seconds', 'flag');
                lookingAwayStart = null;
            }
        } else {
            lookingAwayStart = null;
            if (!proctorStatus.classList.contains('flag') && !proctorStatus.classList.contains('warning')) {
                proctorStatus.textContent = 'Proctoring Active...';
            }
        }

        // Optional: Draw eye landmarks for debugging
        /*
        ctx.beginPath();
        ctx.arc(leftEyeCenterX * videoWidth, (leftEyeInner.y + leftEyeOuter.y) / 2 * video.videoHeight, 3, 0, 2 * Math.PI);
        ctx.arc(rightEyeCenterX * videoWidth, (rightEyeInner.y + rightEyeOuter.y) / 2 * video.videoHeight, 3, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
        */
    }

    // Tab switch detection
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            flagEvent('Tab switch detected', 'warning');
        }
    });

    // Flag event handler
    function flagEvent(message, severity) {
        proctorStatus.textContent = message;
        proctorStatus.classList.remove('flag', 'warning');
        proctorStatus.classList.add(severity);
        fetch('/flag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: message, timestamp: new Date().toISOString(), severity })
        }).catch(err => console.error('Flag submission failed:', err));
    }

    // Submit exam
    submitBtn.addEventListener('click', () => {
        const mcqAnswer = document.querySelector('input[name="q1"]:checked')?.value;
        const code = document.getElementById('code-editor').value;
        fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mcq: mcqAnswer, code })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(`Exam submitted! Score: ${data.score}`);
            } else {
                alert('Submission failed.');
            }
        })
        .catch(err => {
            console.error('Submission failed:', err);
            alert('Submission error: ' + err.message);
        });
    });
});