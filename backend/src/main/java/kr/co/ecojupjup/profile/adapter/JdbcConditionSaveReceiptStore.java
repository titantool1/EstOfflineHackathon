package kr.co.ecojupjup.profile.adapter;

import java.util.*;
import kr.co.ecojupjup.profile.application.ConditionSaveReceiptStore;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto.Envelope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcConditionSaveReceiptStore implements ConditionSaveReceiptStore {
    private static final String DOMAIN="condition-save-receipt";
    private final JdbcTemplate jdbc; private final PrivateFactsCrypto crypto;
    public JdbcConditionSaveReceiptStore(JdbcTemplate jdbc,PrivateFactsCrypto crypto){this.jdbc=jdbc;this.crypto=crypto;}
    @Override public void lockOwner(UUID owner){
        jdbc.update("INSERT INTO app.user_profiles(user_id) SELECT id FROM app.users WHERE id=? ON CONFLICT (user_id) DO NOTHING",owner);
        if(jdbc.query("SELECT user_id FROM app.user_profiles WHERE user_id=? FOR UPDATE",(r,n)->r.getObject(1,UUID.class),owner).isEmpty())
            throw new IllegalArgumentException("UNKNOWN_OWNER");
    }
    @Override public Optional<Receipt> find(UUID owner,UUID attempt){return jdbc.query("SELECT conversation_id,payload_version,key_id,nonce,ciphertext,revision FROM app.condition_save_receipts WHERE owner_id=? AND attempt_id=?",
        (r,n)->new Receipt(r.getObject(1,UUID.class),crypto.decrypt(DOMAIN,owner,attempt.toString(),new Envelope(r.getInt(2),r.getString(3),r.getBytes(4),r.getBytes(5),r.getLong(6)))),owner,attempt).stream().findFirst();}
    @Override public void save(UUID owner,UUID attempt,UUID conversation,byte[] payload){Envelope e=crypto.encrypt(DOMAIN,owner,attempt.toString(),1,payload);jdbc.update("INSERT INTO app.condition_save_receipts(owner_id,attempt_id,conversation_id,payload_version,key_id,nonce,ciphertext,revision) VALUES (?,?,?,?,?,?,?,?)",owner,attempt,conversation,e.payloadVersion(),e.keyId(),e.nonce(),e.ciphertext(),e.revision());}
}
