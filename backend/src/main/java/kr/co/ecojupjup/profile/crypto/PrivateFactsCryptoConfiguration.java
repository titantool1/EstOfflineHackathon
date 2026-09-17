package kr.co.ecojupjup.profile.crypto;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class PrivateFactsCryptoConfiguration {
    @Bean
    PrivateFactsCrypto privateFactsCrypto(@Value("${PRIVATE_FACTS_KEYRING_FILE}") String keyringFile) {
        PrivateFactsKeyring.Loaded keyring = PrivateFactsKeyring.load(keyringFile);
        return new PrivateFactsCrypto(keyring.activeKeyId(), keyring.keys());
    }
}
