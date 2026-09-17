package kr.co.ecojupjup.identity.application;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    public interface Accounts { UUID create(String email, String passwordHash, String nickname); }
    public static class Failure extends RuntimeException {
        public final int status;
        public final String code;
        public Failure(int status, String code, String message) { super(message); this.status=status; this.code=code; }
    }
    private static final SecureRandom RANDOM = new SecureRandom();
    private final Accounts accounts;
    private final PasswordEncoder encoder;
    public AccountService(Accounts accounts, PasswordEncoder encoder) { this.accounts=accounts; this.encoder=encoder; }
    public static String email(String value) {
        String normalized = value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 254 || !normalized.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            throw new Failure(400,"VALIDATION_ERROR","이메일 형식을 확인해 주세요.");
        return normalized;
    }
    public static String nickname(String value) {
        String name = value == null ? "" : value.strip();
        if (name.isEmpty()) return "에코쭙" + (100000 + RANDOM.nextInt(900000));
        if (name.codePointCount(0,name.length()) > 20 || name.codePoints().anyMatch(Character::isISOControl))
            throw new Failure(400,"VALIDATION_ERROR","닉네임은 줄바꿈 없이 20자 이하로 입력해 주세요.");
        return name;
    }
    public static void password(String value, boolean signup) {
        if (value == null || value.length() < (signup ? 8 : 1) || value.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new Failure(400,"VALIDATION_ERROR","비밀번호는 가입 시 8자 이상, UTF-8 72바이트 이하여야 합니다.");
    }
    @Transactional
    public UUID signup(String email, String password, String nickname) {
        String normalizedEmail = email(email);
        password(password,true);
        String name = nickname(nickname);
        try { return accounts.create(normalizedEmail,encoder.encode(password),name); }
        catch (DuplicateKeyException error) { throw new Failure(409,"EMAIL_IN_USE","이미 가입된 이메일입니다."); }
    }
}
