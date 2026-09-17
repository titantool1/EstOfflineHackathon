package kr.co.ecojupjup.profile.application;

import java.util.*;
import kr.co.ecojupjup.profile.application.ConditionSaveMapper.*;
import kr.co.ecojupjup.profile.facts.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConditionSaveService {
    private final ConditionSaveReceiptStore receipts; private final ConditionSaveMapper mapper; private final PrivateFactsStore facts;
    public ConditionSaveService(ConditionSaveReceiptStore receipts,ConditionSaveMapper mapper,PrivateFactsStore facts){this.receipts=receipts;this.mapper=mapper;this.facts=facts;}
    @Transactional
    public void save(UUID authenticatedOwner,ConditionSaveCommand command){
        if(!authenticatedOwner.equals(command.ownerId()))throw new InvalidChange();
        receipts.lockOwner(authenticatedOwner);
        var prior=receipts.find(authenticatedOwner,command.attemptId());
        if(prior.isPresent()){
            var receipt=prior.get();
            if(receipt.conversationId().equals(command.conversationId())&&Arrays.equals(receipt.canonicalPayload(),command.canonicalPayload()))return;
            throw new InvalidChange();
        }
        var changes=mapper.map(authenticatedOwner,command.changes());
        try {
            facts.applyChanges(authenticatedOwner,changes);
        } catch (PrivateFactsException error) {
            if(error.code()==PrivateFactsException.Code.REVISION_CONFLICT)throw new Conflict();
            if(error.code()==PrivateFactsException.Code.INVALID_KEY||error.code()==PrivateFactsException.Code.INVALID_PAYLOAD
                    ||error.code()==PrivateFactsException.Code.NOT_FOUND||error.code()==PrivateFactsException.Code.BROKEN_REFERENCE
                    ||error.code()==PrivateFactsException.Code.CONSTRAINT_VIOLATION)throw new InvalidChange();
            throw error;
        }
        receipts.save(authenticatedOwner,command.attemptId(),command.conversationId(),command.canonicalPayload());
    }
}
