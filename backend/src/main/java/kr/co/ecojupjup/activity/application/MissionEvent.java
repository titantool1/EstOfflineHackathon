package kr.co.ecojupjup.activity.application;

import java.time.OffsetDateTime;
import java.util.UUID;

public record MissionEvent(UUID eventId,UUID clientEventId,UUID batchId,UUID itemId,
        String eventType,OffsetDateTime occurredAt,OffsetDateTime recordedAt) {}
