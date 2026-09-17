package kr.co.ecojupjup.activity.application;

public class MissionEventException extends RuntimeException {
    public final int status; public final String code;
    public MissionEventException(int status,String code) { super(code);this.status=status;this.code=code; }
}
