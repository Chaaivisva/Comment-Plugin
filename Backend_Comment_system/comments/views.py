from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth.models import User
from .models import Comment, Notification, CommentRecipient
from .serializers import CommentSerializer, NotificationSerializer
from django.core.mail import send_mail
from django.conf import settings
from django.http import HttpResponse
import re
from django.db.models import Q

from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token

class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    
    def get_queryset(self):
        user = self.request.user
        page_url = self.request.query_params.get('page_url', None)

        if not user.is_authenticated or not page_url:
            return Comment.objects.none()
        parent_comments_q = (
            Q(user=user) | 
            Q(recipients__recipient_email=user.email)
        )
        
        parent_comments = Comment.objects.filter(page_url=page_url).filter(parent_comments_q)
        all_comments = Comment.objects.filter(
            Q(id__in=parent_comments.values('id')) | Q(parent__in=parent_comments)
        ).order_by('created_at')

        return all_comments

    def perform_create(self, serializer):
        comment = serializer.save(user=self.request.user)
        tagged_user_email = self.request.data.get('tagged_user_email')
        if tagged_user_email:
            CommentRecipient.objects.create(comment=comment, recipient_email=tagged_user_email)

            subject = f"You were mentioned in a comment (Reply-ID: {comment.unique_reply_id})"
            message = (
                f"Hello there,\n\n"
                f"{self.request.user.username} mentioned you in a comment on {comment.page_url}.\n\n"
                f"Selected Text: '{comment.selected_text}'\n\n"
                f"Comment: '{comment.comment_text}'\n\n"
                "To reply directly through our comment system, you must first install the browser plugin.\n"
                "You can download it here:\n\n"
                f"-> YOUR_PLUGIN_DOWNLOAD_LINK/plugin.zip\n\n"
                "Once installed, visit the page to see the comment and add your reply.\n"
            )
            
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [tagged_user_email],
                fail_silently=False,
            )

class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all().order_by('-created_at')
    serializer_class = NotificationSerializer
    
    def get_queryset(self):
        return self.queryset.filter(recipient=self.request.user)
    
    @action(detail=True, methods=['patch'])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response(status=status.HTTP_200_OK)
    
class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user) 
        return Response({
            'token': token.key,
            'user_id': user.pk,
            'email': user.email
        })

def receive_email(request):
    if request.method == "POST":
        sender_email = request.POST.get('sender')
        subject = request.POST.get('subject', '')
        body = request.POST.get('stripped-text', request.POST.get('body-plain', ''))
        
        match = re.search(r'Reply-ID: ([a-f0-9-]+)', subject)
        if not match:
            return HttpResponse(status=status.HTTP_400_BAD_REQUEST, content="Invalid reply format.")
        
        unique_reply_id = match.group(1)
        
        try:
            parent_comment = Comment.objects.get(unique_reply_id=unique_reply_id)
            try:
                sender_user = User.objects.get(email=sender_email)
            except User.DoesNotExist:
                sender_user = parent_comment.user
        except Comment.DoesNotExist:
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)
        
        reply_comment = Comment.objects.create(
            user=sender_user,
            page_url=parent_comment.page_url,
            selected_text=parent_comment.selected_text,
            comment_text=body,
            parent=parent_comment
        )
        
        original_commenter = parent_comment.user
        if original_commenter and original_commenter.email != sender_email:
            reply_subject = f"New reply to your comment on {parent_comment.page_url}"
            reply_message = (
                f"Hello {original_commenter.username},\n\n"
                f"{sender_user.username} has replied to your comment:\n\n"
                f"'{body}'\n\n"
                f"Original comment: '{parent_comment.comment_text}'"
            )
            send_mail(
                reply_subject,
                reply_message,
                settings.DEFAULT_FROM_EMAIL,
                [original_commenter.email],
                fail_silently=False,
            )

        return HttpResponse(status=status.HTTP_200_OK)
    return HttpResponse(status=status.HTTP_405_METHOD_NOT_ALLOWED)