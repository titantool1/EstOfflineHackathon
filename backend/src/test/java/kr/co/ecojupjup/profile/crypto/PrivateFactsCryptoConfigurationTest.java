package kr.co.ecojupjup.profile.crypto;

import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.beans.BeansException;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.StandardEnvironment;

class PrivateFactsCryptoConfigurationTest {
    @Test
    void applicationContextFailsWithoutAConfiguredKeyringFile() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources()
                    .remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
            context.getEnvironment().getPropertySources()
                    .remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
            context.register(PrivateFactsCryptoConfiguration.class);

            assertThrows(BeansException.class, context::refresh);
        }
    }
}
