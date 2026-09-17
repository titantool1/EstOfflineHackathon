package kr.co.ecojupjup.activity.application;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface MissionEventStore {
    record CompletedMission(String programKey, String actionId) {}
    List<CompletedMission> completedMissions(UUID owner);
    List<CompletedMission> acceptedMissions(UUID owner);
    default long completedMissionCount(UUID owner) { return completedMissions(owner).size(); }
    void lockOwner(UUID owner);
    Optional<MissionEvent> findByClientEvent(UUID owner,UUID clientEventId);
    boolean impressionExists(UUID owner,UUID batchId,UUID itemId);
    void save(UUID owner,MissionEvent event);
}
