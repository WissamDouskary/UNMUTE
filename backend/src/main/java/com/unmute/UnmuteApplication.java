package com.unmute;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class UnmuteApplication {

    public static void main(String[] args) {
        SpringApplication.run(UnmuteApplication.class, args);
    }
}
