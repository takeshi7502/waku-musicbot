package dev.takeshi.lavalink.status;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Read-only endpoint consumed only by the local status-dashboard sidecar. */
@RestController
@RequestMapping("/status/activity")
public final class ActivityController {
    private final ActivityTracker activityTracker;

    public ActivityController(ActivityTracker activityTracker) {
        this.activityTracker = activityTracker;
    }

    @GetMapping
    public ActivityTracker.ActivitySnapshot activity() {
        return activityTracker.snapshot();
    }

    /**
     * A local-only event feed for the dashboard sidecar. The dashboard keeps one
     * subscription and fans updates out to its own visitors, so Lavalink is not
     * burdened with a stream per public viewer.
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return activityTracker.subscribe();
    }
}
