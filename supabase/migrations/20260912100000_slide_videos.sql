-- Slide videos.
--
-- Yes Smile's two video templates (three-video, two-video) take a short clip
-- per slot, so the slides bucket accepts the browser video types next to the
-- images, and the size limit rises to what a portrait clip needs. The
-- upload endpoint (src/routes/api/slides/images/+server.ts) mirrors both:
-- 10 MB for an image, 50 MB for a video. The folder policies are unchanged.

update storage.buckets
set
	file_size_limit = 52428800,
	allowed_mime_types = array[
		'image/jpeg', 'image/png', 'image/webp', 'image/gif',
		'video/mp4', 'video/webm', 'video/quicktime'
	]
where id = 'slides';
