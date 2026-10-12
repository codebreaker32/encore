# Encore crowd clip library - credits and provenance

All clips below come from Pexels and are used under the **Pexels License** (https://www.pexels.com/license/): free for commercial use, modification allowed, attribution not required, no permission needed; the licence forbids selling unaltered copies and redistributing the files on other stock-footage/wallpaper platforms, which shipping them as app assets inside this repository is not. Author names are recorded anyway.

## On-screen credit required

None. No CC BY, CC0-with-request or other attribution-bearing clip is included, so no credit line needs to be shown. (Optional courtesy line if wanted: `Crowd footage: Pexels contributors - see CREDITS.md`.)

## Processing

Every clip: trimmed with `-ss`/`-t`, scaled with `force_original_aspect_ratio=increase` then centre-cropped to 1280x720 (no letterboxing), source frame rate kept, H.264 High profile yuv420p, CRF 23 with `-maxrate 3M -bufsize 6M`, `-movflags +faststart`, no audio. Posters are the first frame of the trim taken from the native-resolution source, 1920x1080 when the source is at least 1080p, else 1280x720, saved as JPEG quality 82 (Pillow). Where a row says the frame was pre-cropped, a `crop=W:H:X:Y` on the native source precedes the scale so the output is a tighter window of the shot; every such crop is still a downscale to 1280x720 (no upscaling). ffmpeg used: static build from the `imageio-ffmpeg` pip package (ffmpeg 7.0.2). `<id>.mp4` in the commands is the downloaded source file.

## Clips

| File | Shows | Source page | Direct download | Author | Licence | Original length / resolution / fps | Trim window | Output |
|---|---|---|---|---|---|---|---|---|
| `openmic-wide-1.mp4` / `.jpg` | Small neon-lit room (pink/teal wash), about six listeners on a couch and the floor facing the camera, attentive, small shifts; static camera from the performer's spot. Home-concert scale (6-8 people), not a 20-40 seat bar. | https://www.pexels.com/video/people-listening-music-band-8513567/ | https://www.pexels.com/download/video/8513567/ | Big Bag Films (https://www.pexels.com/@bigbagfilms/) | Pexels License (https://www.pexels.com/license/) | 20.08 s, 3840x2160, 25.0 fps (page lists 3840x2160 25 fps, 0:20) | 12 s to 20 s (8 s) | 8.0 s, 1280x720, 25.0 fps, 1.12 MB; poster 1920x1080 192 KB |
| `openmic-wide-2.mp4` / `.jpg` | Same small neon room from the player's spot behind a keyboard (no performer visible); about eight seated listeners, hands clasped, attentive; static. The frame is pre-cropped to the top 75% of the 4K source so only a sliver of keyboard remains at the bottom edge. | https://www.pexels.com/video/people-watching-a-concert-in-a-room-8513529/ | https://www.pexels.com/download/video/8513529/ | Big Bag Films (https://www.pexels.com/@bigbagfilms/) | Pexels License (https://www.pexels.com/license/) | 17.8 s, 3840x2160, 25.0 fps (page lists 3840x2160 25 fps, 0:18) | 4 s to 12 s (8 s) | 8.0 s, 1280x720, 25.0 fps, 1.04 MB; poster 1920x1080 146 KB |
| `openmic-reaction-1.mp4` / `.jpg` | Four women at a bar table under a warm lamp laughing and gesturing; a foreground hand waves at the frame edge; staged actors in a real bar. Laugh is already going at the first frame. | https://www.pexels.com/video/four-women-drinking-at-a-bar-6174381/ | https://www.pexels.com/download/video/6174381/ | RDNE Stock project (https://www.pexels.com/@rdne/) | Pexels License (https://www.pexels.com/license/) | 9.24 s, 1280x720, 30.0 fps (page lists 1920x1080 30 fps, 0:09, but the only file Pexels serves is 1280x720) | 3.2 s to 9.2 s (6 s) | 6.0 s, 1280x720, 30.0 fps, 1.94 MB; poster 1280x720 98 KB |
| `openmic-reaction-2.mp4` / `.jpg` | Man in a dark T-shirt clapping with eyes closed and smiling, two more clapping behind him, pink/teal small-room light; static; applause from the first frame. | https://www.pexels.com/video/footage-of-people-clapping-hands-8513487/ | https://www.pexels.com/download/video/8513487/ | Big Bag Films (https://www.pexels.com/@bigbagfilms/) | Pexels License (https://www.pexels.com/license/) | 14.08 s, 3840x2160, 25.0 fps (page lists 3840x2160 25 fps, 0:14) | 0 s to 8 s (8 s) | 8.0 s, 1280x720, 25.0 fps, 1.17 MB; poster 1920x1080 137 KB |
| `openmic-finale-1.mp4` / `.jpg` | Three people in the front row clapping and smiling with more behind, small neon-lit room; static; applause from first frame to last. | https://www.pexels.com/video/people-clapping-together-8513482/ | https://www.pexels.com/download/video/8513482/ | Big Bag Films (https://www.pexels.com/@bigbagfilms/) | Pexels License (https://www.pexels.com/license/) | 9.56 s, 3840x2160, 25.0 fps (page lists 3840x2160 25 fps, 0:10) | 0 s to 9.5 s (9.5 s) | 9.52 s, 1280x720, 25.0 fps, 1.64 MB; poster 1920x1080 185 KB |
| `club-wide-1.mp4` / `.jpg` | Camera on the stage looking out: a small night-time live venue, 30-60 people standing at the stage lip lit by one warm stage lamp, faces toward the camera, mic stands in frame; static. The 4K frame is pre-cropped to a 2222x1250 window (crop=2222:1250:1450:250, still a downscale to 720p) to exclude the performer's leg at the left edge and the pedalboard/LED pars along the bottom; the clip ends before a blue-lit guitar edge creeps into the left of that window at 17 s. Wide window: arms coming down, then people watching and chatting. Reaction window: a woman and her friends throw their arms up and cheer from the first frame. | https://www.pexels.com/video/a-man-singing-into-a-microphone-while-people-watch-9481014/ | https://www.pexels.com/download/video/9481014/ | K (https://www.pexels.com/@kelly/) | Pexels License (https://www.pexels.com/license/) | 18.73 s, 3840x2160, 23.98 fps (page lists 3840x2160 23.98 fps, 0:19) | 8 s to 16.5 s (8.5 s) | 8.51 s, 1280x720, 23.98 fps, 1.91 MB; poster 1920x1080 134 KB |
| `club-wide-2.mp4` / `.jpg` | Same night venue and camera position as club-wide-1 (camera on the stage looking out), earlier in the set: 8-10 people at the stage lip standing and watching, faces to the camera, drinks in hand, one filming on a phone, shifting but no raised arms and no cheering; a mic stand in the middle, the stage lamp's glow at the top-left; static. The 4K frame is pre-cropped to a 1888x1062 window (crop=1888:1062:400:300, zoom 2.03x, still a downscale to 720p) to exclude the stage lamp, the pedalboard/LED pars and a glow-stick-wearing crowd member at the right; the clip ends before the guitarist walks in at 12 s. Dark (mean luma about 37/255). | https://www.pexels.com/video/people-watching-a-live-performance-9481008/ | https://www.pexels.com/download/video/9481008/ | K (https://www.pexels.com/@kelly/) | Pexels License (https://www.pexels.com/license/) | 21.48 s, 3840x2160, 23.98 fps (page lists 3840x2160 23.98 fps, 0:21) | 0.4 s to 10.4 s (10 s) | 10.01 s, 1280x720, 23.98 fps, 1.24 MB; poster 1920x1080 95 KB |
| `club-reaction-1.mp4` / `.jpg` | Camera on the stage looking out: a small night-time live venue, 30-60 people standing at the stage lip lit by one warm stage lamp, faces toward the camera, mic stands in frame; static. The 4K frame is pre-cropped to a 2222x1250 window (crop=2222:1250:1450:250, still a downscale to 720p) to exclude the performer's leg at the left edge and the pedalboard/LED pars along the bottom; the clip ends before a blue-lit guitar edge creeps into the left of that window at 17 s. Wide window: arms coming down, then people watching and chatting. Reaction window: a woman and her friends throw their arms up and cheer from the first frame. | https://www.pexels.com/video/a-man-singing-into-a-microphone-while-people-watch-9481014/ | https://www.pexels.com/download/video/9481014/ | K (https://www.pexels.com/@kelly/) | Pexels License (https://www.pexels.com/license/) | 18.73 s, 3840x2160, 23.98 fps (page lists 3840x2160 23.98 fps, 0:19) | 0 s to 8 s (8 s) | 8.01 s, 1280x720, 23.98 fps, 1.93 MB; poster 1920x1080 147 KB |
| `club-reaction-2.mp4` / `.jpg` | Two women at a small table in a dark red bar room under a warm lamp, cocktails in front of them, facing the camera and laughing hard from the first frame (one doubles over); staged actors in a real bar; static. Only 5.4 s: cut before a foreground hand sweeps in at 5.5 s (the source starts mid-laugh, so it cannot be extended at the front). | https://www.pexels.com/video/group-of-women-drinking-in-the-club-6174376/ | https://www.pexels.com/download/video/6174376/ | RDNE Stock project (https://www.pexels.com/@rdne/) | Pexels License (https://www.pexels.com/license/) | 9.69 s, 1920x1080, 30.0 fps (page lists 1920x1080 30 fps, 0:10) | 0 s to 5.4 s (5.4 s) | 5.4 s, 1280x720, 30.0 fps, 1.28 MB; poster 1920x1080 243 KB |
| `club-finale-1.mp4` / `.jpg` | Standing club crowd (roughly a hundred) seen from the stage under warm orange light, hands raised, cheering; handheld with slight sway. | https://www.pexels.com/video/energetic-crowd-at-live-music-concert-34981850/ | https://www.pexels.com/download/video/34981850/ | WeStarMoney Rec (https://www.pexels.com/@westarmoney/) | Pexels License (https://www.pexels.com/license/) | 26.4 s, 1920x1080, 30.0 fps (page lists 1920x1080 30 fps, 0:26) | 10 s to 18 s (8 s) | 8.0 s, 1280x720, 30.0 fps, 3.25 MB; poster 1920x1080 165 KB |
| `theatre-wide-1.mp4` / `.jpg` | Rows of red theatre seats with about twenty people watching attentively, dark auditorium; static. | https://www.pexels.com/video/people-watching-movie-on-movie-theater-7986777/ | https://www.pexels.com/download/video/7986777/ | Tima Miroshnichenko (https://www.pexels.com/@tima-miroshnichenko/) | Pexels License (https://www.pexels.com/license/) | 17.88 s, 4096x2160, 25.0 fps (page lists 4096x2160 25 fps, 0:18) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 0.59 MB; poster 1920x1080 97 KB |
| `theatre-wide-2.mp4` / `.jpg` | Large dark red-seat auditorium from the front, about fifteen people spread over the front rows, projector light above; sparse; static. | https://www.pexels.com/video/people-inside-a-movie-theater-7984153/ | https://www.pexels.com/download/video/7984153/ | Tima Miroshnichenko (https://www.pexels.com/@tima-miroshnichenko/) | Pexels License (https://www.pexels.com/license/) | 44.84 s, 4096x2160, 25.0 fps (page lists 4096x2160 25 fps, 0:45) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 0.66 MB; poster 1920x1080 124 KB |
| `theatre-reaction-1.mp4` / `.jpg` | Rows of red seats with about twenty-five people laughing, lit from the front; static; laughter throughout. | https://www.pexels.com/video/people-laughing-while-watching-in-movie-theater-7985879/ | https://www.pexels.com/download/video/7985879/ | Tima Miroshnichenko (https://www.pexels.com/@tima-miroshnichenko/) | Pexels License (https://www.pexels.com/license/) | 25.56 s, 4096x2160, 25.0 fps (page lists 4096x2160 25 fps, 0:26) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 0.89 MB; poster 1920x1080 126 KB |
| `theatre-reaction-2.mp4` / `.jpg` | Medium shot across red seats of four people smiling and laughing gently; static. | https://www.pexels.com/video/people-watching-movie-in-a-cinema-7985884/ | https://www.pexels.com/download/video/7985884/ | Tima Miroshnichenko (https://www.pexels.com/@tima-miroshnichenko/) | Pexels License (https://www.pexels.com/license/) | 26.0 s, 4096x2160, 25.0 fps (page lists 4096x2160 25 fps, 0:26) | 0 s to 8 s (8 s) | 8.0 s, 1280x720, 25.0 fps, 0.56 MB; poster 1920x1080 86 KB |
| `theatre-finale-1.mp4` / `.jpg` | Woman standing in a large blue-lit tiered arena clapping (hands meet, part, and are sometimes held together), big seated crowd behind; near-static. Large gathering, not a theatre; 23.976 fps kept. | https://www.pexels.com/video/crowd-of-people-at-an-event-12695739/ | https://www.pexels.com/download/video/12695739/ | Luis Quintero (https://www.pexels.com/@jibarofoto/) | Pexels License (https://www.pexels.com/license/) | 17.07 s, 1920x1080, 23.98 fps (page lists 1920x1080 23.98 fps, 0:17) | 0 s to 10 s (10 s) | 10.01 s, 1280x720, 23.98 fps, 1.48 MB; poster 1920x1080 190 KB |
| `arena-wide-1.mp4` / `.jpg` | High wide of a packed arena floor under red light, thousands of heads and a lighting truss; static. | https://www.pexels.com/video/energetic-concert-crowd-under-vibrant-red-lights-34059094/ | https://www.pexels.com/download/video/34059094/ | WeStarMoney Rec (https://www.pexels.com/@westarmoney/) | Pexels License (https://www.pexels.com/license/) | 10.87 s, 1920x1080, 30.0 fps (page lists 1920x1080 30 fps, 0:10) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 30.0 fps, 3.39 MB; poster 1920x1080 196 KB |
| `arena-wide-2.mp4` / `.jpg` | Large crowd seen from the stage under purple light, hands up and bouncing; static. | https://www.pexels.com/video/concert-crowd-jumping-26744649/ | https://www.pexels.com/download/video/26744649/ | Cristian Geza (https://www.pexels.com/@cristian-geza-1311862362/) | Pexels License (https://www.pexels.com/license/) | 14.04 s, 1920x1080, 25.0 fps (page lists 1920x1080 25 fps, 0:14) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 2.30 MB; poster 1920x1080 148 KB |
| `arena-reaction-1.mp4` / `.jpg` | Forest of raised hands in blue light seen from the stage, crowd cheering; static; hands up from the first frame. | https://www.pexels.com/video/crowd-concert-hands-26744501/ | https://www.pexels.com/download/video/26744501/ | Cristian Geza (https://www.pexels.com/@cristian-geza-1311862362/) | Pexels License (https://www.pexels.com/license/) | 17.92 s, 1920x1080, 25.0 fps (page lists 1920x1080 25 fps, 0:17) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 1.58 MB; poster 1920x1080 148 KB |
| `arena-reaction-2.mp4` / `.jpg` | Blue-lit arena crowd, faces waving and cheering with phone lights, slow camera glide; 23.976 fps kept. | https://www.pexels.com/video/crowd-of-people-at-a-concert-12695738/ | https://www.pexels.com/download/video/12695738/ | Luis Quintero (https://www.pexels.com/@jibarofoto/) | Pexels License (https://www.pexels.com/license/) | 25.83 s, 1920x1080, 23.98 fps (page lists 1920x1080 23.98 fps, 0:26) | 0 s to 8 s (8 s) | 8.01 s, 1280x720, 23.98 fps, 1.85 MB; poster 1920x1080 194 KB |
| `arena-finale-1.mp4` / `.jpg` | Night crowd of thousands with hands and phones up as the stage lights sweep from yellow to pink/red; slow camera glide; 29.97 fps kept. | https://www.pexels.com/video/lively-night-concert-audience-cheering-30334108/ | https://www.pexels.com/download/video/30334108/ | Ranjeet Chauhan (https://www.pexels.com/@ranjeet-chauhan-485922/) | Pexels License (https://www.pexels.com/license/) | 9.94 s, 1920x1080, 29.97 fps (page lists 1920x1080 29.97 fps, 0:09) | 0 s to 9.5 s (9.5 s) | 9.51 s, 1280x720, 29.97 fps, 3.79 MB; poster 1920x1080 170 KB |
| `singing-wide-1.mp4` / `.jpg` | Big dark auditorium seen from the stage, filled with swaying phone lights, purple spotlight at the back; static. | https://www.pexels.com/video/vibrant-auditorium-concert-with-cheering-crowd-36499729/ | https://www.pexels.com/download/video/36499729/ | Sourabh Narwade (https://www.pexels.com/@daredevil/) | Pexels License (https://www.pexels.com/license/) | 36.96 s, 1920x1080, 25.0 fps (page lists 1920x1080 25 fps, 0:36) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 2.03 MB; poster 1920x1080 219 KB |
| `singing-reaction-1.mp4` / `.jpg` | Slow pan across faces lit red and blue, phones raised, singing along and cheering; 29.97 fps kept. | https://www.pexels.com/video/vibrant-concert-audience-enjoying-live-performance-30334312/ | https://www.pexels.com/download/video/30334312/ | Ranjeet Chauhan (https://www.pexels.com/@ranjeet-chauhan-485922/) | Pexels License (https://www.pexels.com/license/) | 13.48 s, 1920x1080, 29.97 fps (page lists 1920x1080 29.97 fps, 0:13) | 0 s to 10 s (10 s) | 10.01 s, 1280x720, 29.97 fps, 2.52 MB; poster 1920x1080 214 KB |
| `poetry-reaction-1.mp4` / `.jpg` | Three people on a couch in a small neon room, attentive, the man at left snapping/gesturing; colour wash cycles pink to teal to purple; static. | https://www.pexels.com/video/a-group-of-people-swaying-while-watching-a-concert-8513474/ | https://www.pexels.com/download/video/8513474/ | Big Bag Films (https://www.pexels.com/@bigbagfilms/) | Pexels License (https://www.pexels.com/license/) | 14.64 s, 3840x2160, 25.0 fps (page lists 3840x2160 25 fps, 0:15) | 0 s to 10 s (10 s) | 10.0 s, 1280x720, 25.0 fps, 1.47 MB; poster 1920x1080 158 KB |

## ffmpeg commands

### openmic-wide-1

```sh
ffmpeg -y -ss 12 -i 8513567.mp4 -t 8 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart openmic-wide-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 12 -i 8513567.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 openmic-wide-1.png && python -c "from PIL import Image; Image.open('openmic-wide-1.png').convert('RGB').save('openmic-wide-1.jpg','JPEG',quality=82,optimize=True)"
```

### openmic-wide-2

```sh
ffmpeg -y -ss 4 -i 8513529.mp4 -t 8 -an -vf crop=2880:1620:480:0,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart openmic-wide-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 4 -i 8513529.mp4 -frames:v 1 -vf crop=2880:1620:480:0,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 openmic-wide-2.png && python -c "from PIL import Image; Image.open('openmic-wide-2.png').convert('RGB').save('openmic-wide-2.jpg','JPEG',quality=82,optimize=True)"
```

### openmic-reaction-1

```sh
ffmpeg -y -ss 3.2 -i 6174381.mp4 -t 6 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart openmic-reaction-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 3.2 -i 6174381.mp4 -frames:v 1 -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720 openmic-reaction-1.png && python -c "from PIL import Image; Image.open('openmic-reaction-1.png').convert('RGB').save('openmic-reaction-1.jpg','JPEG',quality=82,optimize=True)"
```

### openmic-reaction-2

```sh
ffmpeg -y -ss 0 -i 8513487.mp4 -t 8 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart openmic-reaction-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 8513487.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 openmic-reaction-2.png && python -c "from PIL import Image; Image.open('openmic-reaction-2.png').convert('RGB').save('openmic-reaction-2.jpg','JPEG',quality=82,optimize=True)"
```

### openmic-finale-1

```sh
ffmpeg -y -ss 0 -i 8513482.mp4 -t 9.5 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart openmic-finale-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 8513482.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 openmic-finale-1.png && python -c "from PIL import Image; Image.open('openmic-finale-1.png').convert('RGB').save('openmic-finale-1.jpg','JPEG',quality=82,optimize=True)"
```

### club-wide-1

```sh
ffmpeg -y -ss 8 -i 9481014.mp4 -t 8.5 -an -vf crop=2222:1250:1450:250,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart club-wide-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 8 -i 9481014.mp4 -frames:v 1 -vf crop=2222:1250:1450:250,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 club-wide-1.png && python -c "from PIL import Image; Image.open('club-wide-1.png').convert('RGB').save('club-wide-1.jpg','JPEG',quality=82,optimize=True)"
```

### club-wide-2

```sh
ffmpeg -y -ss 0.4 -i 9481008.mp4 -t 10 -an -vf crop=1888:1062:400:300,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart club-wide-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0.4 -i 9481008.mp4 -frames:v 1 -vf crop=1888:1062:400:300,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 club-wide-2.png && python -c "from PIL import Image; Image.open('club-wide-2.png').convert('RGB').save('club-wide-2.jpg','JPEG',quality=82,optimize=True)"
```

### club-reaction-1

```sh
ffmpeg -y -ss 0 -i 9481014.mp4 -t 8 -an -vf crop=2222:1250:1450:250,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart club-reaction-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 9481014.mp4 -frames:v 1 -vf crop=2222:1250:1450:250,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 club-reaction-1.png && python -c "from PIL import Image; Image.open('club-reaction-1.png').convert('RGB').save('club-reaction-1.jpg','JPEG',quality=82,optimize=True)"
```

### club-reaction-2

```sh
ffmpeg -y -ss 0 -i 6174376.mp4 -t 5.4 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart club-reaction-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 6174376.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 club-reaction-2.png && python -c "from PIL import Image; Image.open('club-reaction-2.png').convert('RGB').save('club-reaction-2.jpg','JPEG',quality=82,optimize=True)"
```

### club-finale-1

```sh
ffmpeg -y -ss 10 -i 34981850.mp4 -t 8 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart club-finale-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 10 -i 34981850.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 club-finale-1.png && python -c "from PIL import Image; Image.open('club-finale-1.png').convert('RGB').save('club-finale-1.jpg','JPEG',quality=82,optimize=True)"
```

### theatre-wide-1

```sh
ffmpeg -y -ss 0 -i 7986777.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart theatre-wide-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 7986777.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 theatre-wide-1.png && python -c "from PIL import Image; Image.open('theatre-wide-1.png').convert('RGB').save('theatre-wide-1.jpg','JPEG',quality=82,optimize=True)"
```

### theatre-wide-2

```sh
ffmpeg -y -ss 0 -i 7984153.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart theatre-wide-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 7984153.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 theatre-wide-2.png && python -c "from PIL import Image; Image.open('theatre-wide-2.png').convert('RGB').save('theatre-wide-2.jpg','JPEG',quality=82,optimize=True)"
```

### theatre-reaction-1

```sh
ffmpeg -y -ss 0 -i 7985879.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart theatre-reaction-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 7985879.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 theatre-reaction-1.png && python -c "from PIL import Image; Image.open('theatre-reaction-1.png').convert('RGB').save('theatre-reaction-1.jpg','JPEG',quality=82,optimize=True)"
```

### theatre-reaction-2

```sh
ffmpeg -y -ss 0 -i 7985884.mp4 -t 8 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart theatre-reaction-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 7985884.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 theatre-reaction-2.png && python -c "from PIL import Image; Image.open('theatre-reaction-2.png').convert('RGB').save('theatre-reaction-2.jpg','JPEG',quality=82,optimize=True)"
```

### theatre-finale-1

```sh
ffmpeg -y -ss 0 -i 12695739.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart theatre-finale-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 12695739.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 theatre-finale-1.png && python -c "from PIL import Image; Image.open('theatre-finale-1.png').convert('RGB').save('theatre-finale-1.jpg','JPEG',quality=82,optimize=True)"
```

### arena-wide-1

```sh
ffmpeg -y -ss 0 -i 34059094.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart arena-wide-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 34059094.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 arena-wide-1.png && python -c "from PIL import Image; Image.open('arena-wide-1.png').convert('RGB').save('arena-wide-1.jpg','JPEG',quality=82,optimize=True)"
```

### arena-wide-2

```sh
ffmpeg -y -ss 0 -i 26744649.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart arena-wide-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 26744649.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 arena-wide-2.png && python -c "from PIL import Image; Image.open('arena-wide-2.png').convert('RGB').save('arena-wide-2.jpg','JPEG',quality=82,optimize=True)"
```

### arena-reaction-1

```sh
ffmpeg -y -ss 0 -i 26744501.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart arena-reaction-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 26744501.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 arena-reaction-1.png && python -c "from PIL import Image; Image.open('arena-reaction-1.png').convert('RGB').save('arena-reaction-1.jpg','JPEG',quality=82,optimize=True)"
```

### arena-reaction-2

```sh
ffmpeg -y -ss 0 -i 12695738.mp4 -t 8 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart arena-reaction-2.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 12695738.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 arena-reaction-2.png && python -c "from PIL import Image; Image.open('arena-reaction-2.png').convert('RGB').save('arena-reaction-2.jpg','JPEG',quality=82,optimize=True)"
```

### arena-finale-1

```sh
ffmpeg -y -ss 0 -i 30334108.mp4 -t 9.5 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart arena-finale-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 30334108.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 arena-finale-1.png && python -c "from PIL import Image; Image.open('arena-finale-1.png').convert('RGB').save('arena-finale-1.jpg','JPEG',quality=82,optimize=True)"
```

### singing-wide-1

```sh
ffmpeg -y -ss 0 -i 36499729.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart singing-wide-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 36499729.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 singing-wide-1.png && python -c "from PIL import Image; Image.open('singing-wide-1.png').convert('RGB').save('singing-wide-1.jpg','JPEG',quality=82,optimize=True)"
```

### singing-reaction-1

```sh
ffmpeg -y -ss 0 -i 30334312.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart singing-reaction-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 30334312.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 singing-reaction-1.png && python -c "from PIL import Image; Image.open('singing-reaction-1.png').convert('RGB').save('singing-reaction-1.jpg','JPEG',quality=82,optimize=True)"
```

### poetry-reaction-1

```sh
ffmpeg -y -ss 0 -i 8513474.mp4 -t 10 -an -vf scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1 -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 -maxrate 3M -bufsize 6M -movflags +faststart poetry-reaction-1.mp4
```

Poster:

```sh
ffmpeg -y -ss 0 -i 8513474.mp4 -frames:v 1 -vf scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080 poetry-reaction-1.png && python -c "from PIL import Image; Image.open('poetry-reaction-1.png').convert('RGB').save('poetry-reaction-1.jpg','JPEG',quality=82,optimize=True)"
```


## Strip thumbnails

One `<id>-thumb.jpg` (640x360, JPEG quality 82) per clip for the venue strip. Each is a single frame of the finished `<id>.mp4` (so the same source, trim and licence as that clip's row above), chosen so a face (or, for the arena/singing wides, the densest part of the crowd) fills the frame: `ffmpeg -ss <t> -i <id>.mp4 -frames:v 1 -vf crop=W:H:X:Y,scale=640:360:flags=lanczos` (crop in the 1280x720 clip's pixel grid, zoom = 1280/W, never above 2x), then, where the crop's mean luminance was below 60/255, a gamma lift `out = 255*(in/255)^gamma` found by bisection so the mean reaches 60 (Pillow point LUT), then saved at quality 82. Script: `clipscripts/thumbs.py`.

| Thumbnail | From clip | Frame time in clip (in source) | Crop (W x H at X,Y) / zoom | Mean luma before -> after (gamma) | Size | Licence |
|---|---|---|---|---|---|---|
| `openmic-wide-1-thumb.jpg` | `openmic-wide-1.mp4` (https://www.pexels.com/video/people-listening-music-band-8513567/) | 4 s (source 16 s) | 640x360 at 320,160 / 2.00x | 58 -> 61 (gamma 0.96) | 30 KB | Pexels License, as the clip |
| `openmic-wide-2-thumb.jpg` | `openmic-wide-2.mp4` (https://www.pexels.com/video/people-watching-a-concert-in-a-room-8513529/) | 4 s (source 8 s) | 640x360 at 320,180 / 2.00x | 58 -> 61 (gamma 0.95) | 22 KB | Pexels License, as the clip |
| `openmic-reaction-1-thumb.jpg` | `openmic-reaction-1.mp4` (https://www.pexels.com/video/four-women-drinking-at-a-bar-6174381/) | 0.2 s (source 3.4 s) | 800x450 at 300,100 / 1.60x | 52 -> 61 (gamma 0.89) | 30 KB | Pexels License, as the clip |
| `openmic-reaction-2-thumb.jpg` | `openmic-reaction-2.mp4` (https://www.pexels.com/video/footage-of-people-clapping-hands-8513487/) | 3 s (source 3 s) | 640x360 at 0,60 / 2.00x | 81 -> 81 (gamma 1.00) | 20 KB | Pexels License, as the clip |
| `openmic-finale-1-thumb.jpg` | `openmic-finale-1.mp4` (https://www.pexels.com/video/people-clapping-together-8513482/) | 4 s (source 4 s) | 800x450 at 240,135 / 1.60x | 66 -> 66 (gamma 1.00) | 28 KB | Pexels License, as the clip |
| `club-wide-1-thumb.jpg` | `club-wide-1.mp4` (https://www.pexels.com/video/a-man-singing-into-a-microphone-while-people-watch-9481014/) | 7.5 s (source 15.5 s) | 640x360 at 300,170 / 2.00x | 53 -> 61 (gamma 0.89) | 25 KB | Pexels License, as the clip |
| `club-wide-2-thumb.jpg` | `club-wide-2.mp4` (https://www.pexels.com/video/people-watching-a-live-performance-9481008/) | 4.6 s (source 5 s) | 640x360 at 100,220 / 2.00x | 38 -> 61 (gamma 0.74) | 16 KB | Pexels License, as the clip |
| `club-reaction-1-thumb.jpg` | `club-reaction-1.mp4` (https://www.pexels.com/video/a-man-singing-into-a-microphone-while-people-watch-9481014/) | 2.5 s (source 2.5 s) | 640x360 at 260,130 / 2.00x | 64 -> 64 (gamma 1.00) | 27 KB | Pexels License, as the clip |
| `club-reaction-2-thumb.jpg` | `club-reaction-2.mp4` (https://www.pexels.com/video/group-of-women-drinking-in-the-club-6174376/) | 2 s (source 2 s) | 640x360 at 420,120 / 2.00x | 44 -> 61 (gamma 0.80) | 21 KB | Pexels License, as the clip |
| `club-finale-1-thumb.jpg` | `club-finale-1.mp4` (https://www.pexels.com/video/energetic-crowd-at-live-music-concert-34981850/) | 3 s (source 13 s) | 640x360 at 0,300 / 2.00x | 114 -> 114 (gamma 1.00) | 29 KB | Pexels License, as the clip |
| `theatre-wide-1-thumb.jpg` | `theatre-wide-1.mp4` (https://www.pexels.com/video/people-watching-movie-on-movie-theater-7986777/) | 3 s (source 3 s) | 640x360 at 200,200 / 2.00x | 32 -> 61 (gamma 0.64) | 18 KB | Pexels License, as the clip |
| `theatre-wide-2-thumb.jpg` | `theatre-wide-2.mp4` (https://www.pexels.com/video/people-inside-a-movie-theater-7984153/) | 3 s (source 3 s) | 640x360 at 320,300 / 2.00x | 31 -> 61 (gamma 0.65) | 26 KB | Pexels License, as the clip |
| `theatre-reaction-1-thumb.jpg` | `theatre-reaction-1.mp4` (https://www.pexels.com/video/people-laughing-while-watching-in-movie-theater-7985879/) | 4 s (source 4 s) | 640x360 at 320,300 / 2.00x | 25 -> 61 (gamma 0.56) | 23 KB | Pexels License, as the clip |
| `theatre-reaction-2-thumb.jpg` | `theatre-reaction-2.mp4` (https://www.pexels.com/video/people-watching-movie-in-a-cinema-7985884/) | 3 s (source 3 s) | 800x450 at 240,135 / 1.60x | 22 -> 61 (gamma 0.55) | 18 KB | Pexels License, as the clip |
| `theatre-finale-1-thumb.jpg` | `theatre-finale-1.mp4` (https://www.pexels.com/video/crowd-of-people-at-an-event-12695739/) | 3 s (source 3 s) | 640x360 at 420,100 / 2.00x | 66 -> 66 (gamma 1.00) | 26 KB | Pexels License, as the clip |
| `arena-wide-1-thumb.jpg` | `arena-wide-1.mp4` (https://www.pexels.com/video/energetic-concert-crowd-under-vibrant-red-lights-34059094/) | 4 s (source 4 s) | 640x360 at 320,300 / 2.00x | 35 -> 61 (gamma 0.60) | 50 KB | Pexels License, as the clip |
| `arena-wide-2-thumb.jpg` | `arena-wide-2.mp4` (https://www.pexels.com/video/concert-crowd-jumping-26744649/) | 4 s (source 4 s) | 640x360 at 320,200 / 2.00x | 37 -> 61 (gamma 0.72) | 25 KB | Pexels License, as the clip |
| `arena-reaction-1-thumb.jpg` | `arena-reaction-1.mp4` (https://www.pexels.com/video/crowd-concert-hands-26744501/) | 6 s (source 6 s) | 640x360 at 200,360 / 2.00x | 26 -> 61 (gamma 0.62) | 17 KB | Pexels License, as the clip |
| `arena-reaction-2-thumb.jpg` | `arena-reaction-2.mp4` (https://www.pexels.com/video/crowd-of-people-at-a-concert-12695738/) | 2 s (source 2 s) | 640x360 at 200,200 / 2.00x | 74 -> 74 (gamma 1.00) | 27 KB | Pexels License, as the clip |
| `arena-finale-1-thumb.jpg` | `arena-finale-1.mp4` (https://www.pexels.com/video/lively-night-concert-audience-cheering-30334108/) | 8.5 s (source 8.5 s) | 640x360 at 600,300 / 2.00x | 87 -> 87 (gamma 1.00) | 29 KB | Pexels License, as the clip |
| `singing-wide-1-thumb.jpg` | `singing-wide-1.mp4` (https://www.pexels.com/video/vibrant-auditorium-concert-with-cheering-crowd-36499729/) | 5 s (source 5 s) | 640x360 at 320,300 / 2.00x | 45 -> 61 (gamma 0.79) | 35 KB | Pexels License, as the clip |
| `singing-reaction-1-thumb.jpg` | `singing-reaction-1.mp4` (https://www.pexels.com/video/vibrant-concert-audience-enjoying-live-performance-30334312/) | 1.5 s (source 1.5 s) | 640x360 at 250,200 / 2.00x | 52 -> 61 (gamma 0.90) | 25 KB | Pexels License, as the clip |
| `poetry-reaction-1-thumb.jpg` | `poetry-reaction-1.mp4` (https://www.pexels.com/video/a-group-of-people-swaying-while-watching-a-concert-8513474/) | 2 s (source 2 s) | 640x360 at 260,120 / 2.00x | 72 -> 72 (gamma 1.00) | 26 KB | Pexels License, as the clip |

Folder total (clips + posters + thumbnails): 43.84 MB across 23 clips.
