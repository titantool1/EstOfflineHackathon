package kr.co.ecojupjup.identity.application;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountServiceTest {
    @Test void explicitNicknameIsTrimmedAndStoredWithEncodedPassword() {
        var accounts=mock(AccountService.Accounts.class);var encoder=mock(PasswordEncoder.class);
        UUID id=UUID.randomUUID();when(encoder.encode("password123")).thenReturn("encoded");
        when(accounts.create("member@example.test","encoded","초록이")).thenReturn(id);
        assertEquals(id,new AccountService(accounts,encoder).signup(" MEMBER@example.test ","password123"," 초록이 "));
        verify(accounts).create("member@example.test","encoded","초록이");
    }
    @Test void absentBlankAndWhitespaceNamesGetSixRandomDigits() {
        for (String value : new String[]{null,"","   ","\t\n"})
            assertTrue(AccountService.nickname(value).matches("에코쭙[1-9][0-9]{5}"));
    }
    @Test void invalidNicknameIsRejectedBeforeAnyWrite() {
        var accounts=mock(AccountService.Accounts.class);var encoder=mock(PasswordEncoder.class);
        var service=new AccountService(accounts,encoder);
        for (String name : new String[]{"가".repeat(21),"가\n나"})
            assertEquals(400,assertThrows(AccountService.Failure.class,
                () -> service.signup("a@example.test","password123",name)).status);
        assertEquals("🌱".repeat(20),AccountService.nickname("🌱".repeat(20)));
        verifyNoInteractions(accounts,encoder);
    }
    @Test void duplicateEmailRemainsAConflictAndInvalidCredentialsNeverWrite() {
        var accounts=mock(AccountService.Accounts.class);var encoder=mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenReturn("hash");
        when(accounts.create(anyString(),anyString(),anyString())).thenThrow(new DuplicateKeyException("email"));
        var service=new AccountService(accounts,encoder);
        assertEquals("EMAIL_IN_USE",assertThrows(AccountService.Failure.class,
            () -> service.signup("a@example.test","password123","초록이")).code);
        assertThrows(AccountService.Failure.class,() -> service.signup("bad","password123","초록이"));
        assertThrows(AccountService.Failure.class,() -> service.signup("a@example.test","short","초록이"));
        verify(accounts,times(1)).create(anyString(),anyString(),anyString());
    }
}
