#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <liburing.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s FILE\n", argv[0]);
        return 2;
    }
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct io_uring ring;
    int rc = io_uring_queue_init(2, &ring, 0);
    if (rc < 0) {
        fprintf(stderr, "queue_init: %s\n", strerror(-rc));
        close(fd);
        return 1;
    }
    char buffer[4096];
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    if (!sqe) { fprintf(stderr, "SQ full\n"); rc = -ENOSPC; goto done; }
    io_uring_prep_read(sqe, fd, buffer, sizeof buffer, 0);
    io_uring_sqe_set_data64(sqe, 1);
    rc = io_uring_submit(&ring);
    if (rc != 1) {
        fprintf(stderr, "submit: %s\n", rc < 0 ? strerror(-rc) : "no request submitted");
        rc = -EIO;
        goto done;
    }
    struct io_uring_cqe *cqe;
    do { rc = io_uring_wait_cqe(&ring, &cqe); } while (rc == -EINTR);
    if (rc < 0) { fprintf(stderr, "wait: %s\n", strerror(-rc)); goto done; }
    int result = cqe->res;
    unsigned long long id = (unsigned long long) cqe->user_data;
    io_uring_cqe_seen(&ring, cqe);
    if (id != 1) { fprintf(stderr, "unexpected request id\n"); rc = -EIO; goto done; }
    if (result < 0) { fprintf(stderr, "read: %s\n", strerror(-result)); rc = result; goto done; }
    if (fwrite(buffer, 1, (size_t) result, stdout) != (size_t) result) {
        perror("fwrite"); rc = -EIO;
    } else rc = 0;
done:
    io_uring_queue_exit(&ring);
    close(fd);
    return rc < 0 ? 1 : 0;
}
