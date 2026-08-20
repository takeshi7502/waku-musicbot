package dev.takeshi.lavalink.status;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
