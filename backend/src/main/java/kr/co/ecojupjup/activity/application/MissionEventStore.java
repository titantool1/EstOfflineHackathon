package kr.co.ecojupjup.activity.application;

import java.util.Optional;
import java.util.UUID;

public interface MissionEventStore {
    long completedMissionCount(UUID owner);
    void lockOwner(UUID owner);
    Optional<MissionEvent> findByClientEvent(UUID owner,UUID clientEventId);
    boolean impressionExists(UUID owner,UUID batchId,UUID itemId);
    void save(UUID owner,MissionEvent event);
}
