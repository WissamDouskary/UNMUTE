package com.unmute.source.service;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** Runs a {@code TransactionTemplate} callback immediately. No database and no mock of JDK types. */
final class ImmediateTransactions implements PlatformTransactionManager {

    @Override
    public SimpleTransactionStatus getTransaction(TransactionDefinition definition) throws TransactionException {
        return new SimpleTransactionStatus();
    }

    @Override
    public void commit(org.springframework.transaction.TransactionStatus status) throws TransactionException {
    }

    @Override
    public void rollback(org.springframework.transaction.TransactionStatus status) throws TransactionException {
    }
}
