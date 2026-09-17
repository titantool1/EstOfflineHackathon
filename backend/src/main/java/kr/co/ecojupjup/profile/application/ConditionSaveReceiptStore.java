package kr.co.ecojupjup.profile.application;

import java.util.Optional;
import java.util.UUID;

public interface ConditionSaveReceiptStore {
    void lockOwner(UUID owner);
    Optional<Receipt> find(UUID owner,UUID attemptId);
    void save(UUID owner,UUID attemptId,UUID conversationId,byte[] canonicalPayload);
    record Receipt(UUID conversationId,byte[] canonicalPayload) { public Receipt { canonicalPayload=canonicalPayload.clone(); } @Override public byte[] canonicalPayload(){return canonicalPayload.clone();} }
}
