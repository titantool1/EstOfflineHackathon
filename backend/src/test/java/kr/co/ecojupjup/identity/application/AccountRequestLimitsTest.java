package kr.co.ecojupjup.identity.application;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AccountRequestLimitsTest {
    @Test void accountFailuresExpireAndDoNotBlockOtherAccounts() {
        var now=new AtomicLong(1000);
        var limits=new AccountRequestLimits(2,100,4,10,2,60_000,now::get);
        for(int i=0;i<2;i++)try(var attempt=limits.login("a")){attempt.failed();}
        assertEquals(60,assertThrows(AccountRequestLimits.Rejected.class,()->limits.login("a")).retryAfter);
        try(var other=limits.login("b")){other.success();}
        now.addAndGet(60_000);
        try(var recovered=limits.login("a")){recovered.success();}
    }
    @Test void successResetsFailuresButDoesNotResetGlobalBudget() {
        var limits=new AccountRequestLimits(2,3,4,10,2,60_000,()->1000);
        try(var a=limits.login("a")){a.failed();}
        try(var a=limits.login("a")){a.success();}
        try(var a=limits.login("a")){a.failed();}
        assertThrows(AccountRequestLimits.Rejected.class,()->limits.login("b"));
    }
    @Test void concurrentAttemptsReserveAccountSlotsAndReleaseExactlyOnce() {
        var limits=new AccountRequestLimits(2,100,4,10,2,60_000,()->1000);
        var a=limits.login("a");var b=limits.login("a");
        assertThrows(AccountRequestLimits.Rejected.class,()->limits.login("a"));
        a.close();a.close();
        try(var c=limits.login("a")){c.success();}b.close();
    }
    @Test void globalConcurrencyPersistsAcrossWindowBoundary() {
        var now=new AtomicLong(1000);var limits=new AccountRequestLimits(5,100,1,10,1,60_000,now::get);
        var a=limits.login("a");now.addAndGet(60_000);
        assertEquals(1,assertThrows(AccountRequestLimits.Rejected.class,()->limits.login("b")).retryAfter);
        a.close();try(var b=limits.login("b")){b.success();}
    }
    @Test void signupBudgetIsSeparateAndRecoversAfterWindow() {
        var now=new AtomicLong(1000);var limits=new AccountRequestLimits(5,100,4,2,1,60_000,now::get);
        var first=limits.signup();assertThrows(AccountRequestLimits.Rejected.class,limits::signup);first.close();first.close();
        try(var second=limits.signup()){}
        assertThrows(AccountRequestLimits.Rejected.class,limits::signup);
        try(var login=limits.login("a")){login.success();}
        now.addAndGet(60_000);try(var recovered=limits.signup()){}
    }
    @Test void increasedGlobalBudgetPreservesNewAccountAccessAndExistingFailures() {
        var limits=new AccountRequestLimits(5,10_000,4,10,2,60_000,()->1000);
        for(int i=0;i<5000;i++) {
            try(var attempt=limits.login("account-"+i)){attempt.failed();}
        }
        try(var newcomer=limits.login("new-account")){newcomer.success();}
        for(int i=1;i<5;i++) {
            try(var attempt=limits.login("account-0")){attempt.failed();}
        }
        assertEquals(60,assertThrows(AccountRequestLimits.Rejected.class,
                ()->limits.login("account-0")).retryAfter);
    }
    @Test void invalidConfigurationFailsClosed() {
        assertThrows(IllegalArgumentException.class,()->new AccountRequestLimits(0,60,4,10,2));
    }
}
