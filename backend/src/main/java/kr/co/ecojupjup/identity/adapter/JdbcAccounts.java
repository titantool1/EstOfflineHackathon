package kr.co.ecojupjup.identity.adapter;

import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.identity.application.AccountService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAccounts implements AccountService.Accounts {
    private final JdbcClient jdbc;
    public JdbcAccounts(JdbcClient jdbc) { this.jdbc=jdbc; }
    public Optional<MemberPrincipal> findByEmail(String email) {
        return jdbc.sql("SELECT user_id,email,password_hash,nickname FROM app.user_accounts WHERE email=:email")
            .param("email",email).query((rs,n) -> new MemberPrincipal(rs.getObject("user_id",UUID.class),
                rs.getString("email"),rs.getString("password_hash"),rs.getString("nickname"))).optional();
    }
    @Override public UUID create(String email,String passwordHash,String nickname) {
        UUID id=UUID.randomUUID();
        jdbc.sql("INSERT INTO app.users(id) VALUES (:id)").param("id",id).update();
        jdbc.sql("INSERT INTO app.user_accounts(user_id,email,password_hash,nickname) VALUES (:id,:email,:hash,:nickname)")
            .param("id",id).param("email",email).param("hash",passwordHash).param("nickname",nickname).update();
        jdbc.sql("INSERT INTO app.user_profiles(user_id) VALUES (:id)").param("id",id).update();
        return id;
    }
}
