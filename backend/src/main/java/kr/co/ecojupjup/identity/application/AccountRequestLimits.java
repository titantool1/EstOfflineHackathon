package kr.co.ecojupjup.identity.application;

import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/** Single-process limits. Account failures expire; global budgets bound expensive work. */
public class AccountRequestLimits {
    public static class Rejected extends RuntimeException {
        public final long retryAfter;
        Rejected(long seconds) { super("RATE_LIMITED"); retryAfter=Math.max(1,seconds); }
    }
    private static class Window { long until; int used, active; Window(long until) { this.until=until; } }
    private final Map<String,Window> accounts=new HashMap<>();
    private final Window login=new Window(0),signup=new Window(0);
    private final LongSupplier clock;
    private final int accountMax,loginMax,loginConcurrent,signupMax,signupConcurrent;
    private final long windowMs;
    public AccountRequestLimits(int accountMax,
            int loginMax,
            int loginConcurrent,
            int signupMax,
            int signupConcurrent) {
        this(accountMax,loginMax,loginConcurrent,signupMax,signupConcurrent,60_000,System::currentTimeMillis);
    }
    public AccountRequestLimits(int accountMax,int loginMax,int loginConcurrent,int signupMax,int signupConcurrent,long windowMs,LongSupplier clock) {
        if (accountMax<1 || loginMax<1 || loginConcurrent<1 || signupMax<1 || signupConcurrent<1 || windowMs<1) throw new IllegalArgumentException("positive limits required");
        this.accountMax=accountMax;this.loginMax=loginMax;this.loginConcurrent=loginConcurrent;
        this.signupMax=signupMax;this.signupConcurrent=signupConcurrent;this.windowMs=windowMs;this.clock=clock;
    }
    private long retry(Window w,long now) { return Math.max(1,(w.until-now+999)/1000); }
    private void checkGlobal(Window w,int max,int concurrent,long now) {
        if(now>=w.until) { w.until=now+windowMs;w.used=0; }
        if(w.used>=max) throw new Rejected(retry(w,now));
        if(w.active>=concurrent) throw new Rejected(1);
    }
    public synchronized Attempt login(String normalizedEmail) {
        long now=clock.getAsLong();
        checkGlobal(login,loginMax,loginConcurrent,now);
        accounts.entrySet().removeIf(e -> e.getValue().active==0 && now>=e.getValue().until);
        Window account=accounts.get(normalizedEmail);
        if(account==null) {
            account=new Window(now+windowMs);accounts.put(normalizedEmail,account);
        }
        if(now>=account.until) { account.until=now+windowMs;account.used=0; }
        if(account.used+account.active>=accountMax) throw new Rejected(retry(account,now));
        login.used++;login.active++;account.active++;
        return new Attempt(login,account,normalizedEmail);
    }
    public synchronized Attempt signup() {
        long now=clock.getAsLong();checkGlobal(signup,signupMax,signupConcurrent,now);signup.used++;signup.active++;
        return new Attempt(signup,null,null);
    }
    public final class Attempt implements AutoCloseable {
        private final Window global,account;
        private final String key;
        private boolean closed,success,failed;
        Attempt(Window global,Window account,String key) { this.global=global;this.account=account;this.key=key; }
        public void success() { success=true; }
        public void failed() { failed=true; }
        @Override public void close() {
            synchronized(AccountRequestLimits.this) {
                if(closed)return;closed=true;global.active--;
                if(account!=null) {
                    account.active--;
                    if(success) account.used=0;
                    else if(failed) account.used++;
                    if(account.active==0 && account.used==0) accounts.remove(key,account);
                }
            }
        }
    }
}
